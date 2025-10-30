import { TelegramClient } from 'telegram';
import { Api } from 'telegram/tl';
import { NewMessage } from 'telegram/events';
import { NewMessageEvent } from 'telegram/events';
import { createLogger } from '../utils/logger';
import { UserChannel } from '../mongodb/userChannel.schema';
import { Archive } from '../mongodb/archive.schema';
import { BotUser } from '../mongodb/bot.user.schema';
import { getTempFilePath, cleanupTempFile, ensureDirectoryExists } from '../utils/helpers';
import { targetIDList } from '../utils/targetIds';
import { env } from '../config/env';
import bigInt from 'big-integer';
import path from 'path';
import fs from 'fs';

const logger = createLogger('ArchiveHandler');

const channelCache = new Map<string, number>();
const channelCreationLocks = new Map<string, Promise<any>>();

export const setupArchiveHandler = (client: TelegramClient, userId: number) => {
  logger.info({ userId }, 'Archive handler setup started');

  client.addEventHandler(async (event: NewMessageEvent) => {
    try {
      const message = event.message;
      
      if (!message.peerId) {
        return;
      }

      if (!(message.peerId instanceof Api.PeerUser)) {
        return;
      }

      let peer: Api.User | null = null;
      
      try {
        peer = await client.getEntity(message.peerId) as Api.User;
      } catch (entityError: any) {
        logger.debug({ 
          userId, 
          peerId: message.peerId.userId.toString() 
        }, 'Entity not in cache, fetching from dialogs');
        
        try {
          await client.getDialogs({ limit: 100 });
          peer = await client.getEntity(message.peerId) as Api.User;
        } catch (dialogError: any) {
          logger.warn({ 
            userId, 
            peerId: message.peerId.userId.toString(),
            error: dialogError.message 
          }, 'Could not fetch entity even after dialogs, skipping');
          return;
        }
      }
      
      if (peer && peer instanceof Api.User && !peer.bot && !peer.self) {
        await handlePrivateMessage(client, userId, message, peer);
      }
    } catch (error: any) {
      logger.error({ 
        error: error.message || error.toString(), 
        stack: error.stack,
        userId 
      }, 'Error in archive handler');
    }
  }, new NewMessage({}));
};

const handlePrivateMessage = async (
  client: TelegramClient,
  myId: number,
  message: Api.Message,
  otherUser: Api.User
): Promise<void> => {
  const otherId = Number(otherUser.id);
  const direction = message.out ? 'me->other' : 'other->me';
  
  const userPhone = otherUser.phone ? `+${otherUser.phone}` : undefined;
  const userUsername = otherUser.username || undefined;
  targetIDList.resolveTargetId(otherId, userUsername, userPhone);
  
  logger.info({ myId, otherId, direction, messageId: message.id }, 'Processing PM');

  const user = await BotUser.findOne({ userId: myId });
  if (!user || user.status !== 'active') {
    logger.debug({ myId }, 'User not active, skipping archive');
    return;
  }

  let myName = 'Me';
  try {
    const me = await client.getMe();
    if (me instanceof Api.User) {
      myName = me.firstName || me.username || 'Me';
    }
  } catch (err) {
    logger.debug({ myId }, 'Could not fetch my name');
  }

  const savedMessageEnabled = typeof user.settings.savedMessage === 'boolean'
    ? user.settings.savedMessage
    : user.settings.savedMessage?.enabled || false;

  if (!savedMessageEnabled) {
    logger.debug({ myId }, 'Global archive disabled, skipping');
    return;
  }

  const perChatSettings = user.privateArchive?.find(c => c.chatId === otherId);
  
  let shouldArchiveMessage: boolean;
  let shouldArchiveMedia: boolean;
  const hasText = message.text && message.text.length > 0;
  const hasMedia = !!message.media;
  
  if (perChatSettings) {
    shouldArchiveMessage = perChatSettings.archiveMessages && hasText;
    shouldArchiveMedia = perChatSettings.archiveMedia && hasMedia;
    
    logger.debug({ myId, otherId, override: true, archiveMsg: perChatSettings.archiveMessages, archiveMedia: perChatSettings.archiveMedia }, 'Using per-chat override settings');
  } else {
    shouldArchiveMessage = typeof user.settings.savedMessage === 'boolean'
      ? hasText
      : (user.settings.savedMessage?.message && hasText) || false;

    shouldArchiveMedia = typeof user.settings.savedMessage === 'boolean'
      ? hasMedia
      : (user.settings.savedMessage?.media && hasMedia) || false;
      
    logger.debug({ myId, otherId, override: false }, 'Using default global settings');
  }

  if (!shouldArchiveMessage && !shouldArchiveMedia) {
    logger.debug({ myId, hasText: !!message.text, hasMedia: !!message.media }, 'Nothing to archive based on settings');
    return;
  }

  let channel = await UserChannel.findOne({ my_user_id: myId, user_id: otherId });
  
  if (!channel) {
    const lockKey = `${myId}_${otherId}`;
    
    if (channelCreationLocks.has(lockKey)) {
      logger.info({ myId, otherId }, 'Channel creation in progress, waiting...');
      await channelCreationLocks.get(lockKey);
      channel = await UserChannel.findOne({ my_user_id: myId, user_id: otherId });
      
      if (!channel) {
        logger.error({ myId, otherId }, 'Channel still null after lock wait');
        return;
      }
    } else {
      const creationPromise = (async () => {
        try {
          const newChannel = await createArchiveChannel(client, myId, otherUser);
          return newChannel;
        } catch (error: any) {
          logger.error({ 
            myId, 
            otherId, 
            error: error.message || error.toString(),
            stack: error.stack 
          }, 'Failed to create archive channel');
          throw error;
        } finally {
          channelCreationLocks.delete(lockKey);
        }
      })();
      
      channelCreationLocks.set(lockKey, creationPromise);
      
      try {
        channel = await creationPromise;
      } catch (error) {
        return;
      }
    }
  }

  if (!channel) {
    logger.error({ myId, otherId }, 'Channel is null after creation');
    return;
  }

  let channelPeer = new Api.InputPeerChannel({
    channelId: bigInt(channel.channel_id),
    accessHash: bigInt(channel.channel_access_hash || '0'),
  });

  const verifyResult = await verifyChannelExists(client, channelPeer, channel.channel_id);
  
  if (verifyResult.newAccessHash) {
    await UserChannel.findOneAndUpdate(
      { _id: channel._id },
      { channel_access_hash: verifyResult.newAccessHash }
    );
    
    channelPeer = new Api.InputPeerChannel({
      channelId: bigInt(channel.channel_id),
      accessHash: bigInt(verifyResult.newAccessHash),
    });
    
    logger.info({ myId, otherId, channelId: channel.channel_id }, 'Channel access hash updated in DB');
  }
  
  if (!verifyResult.exists) {
    logger.warn({ 
      myId, 
      otherId, 
      channelId: channel.channel_id 
    }, 'Archive channel was deleted or inaccessible, creating new one');
    
    await UserChannel.deleteOne({ _id: channel._id });
    
    try {
      channel = await createArchiveChannel(client, myId, otherUser);
      if (!channel) {
        logger.error({ myId, otherId }, 'Failed to recreate channel - null returned');
        return;
      }
      
      channelPeer = new Api.InputPeerChannel({
        channelId: bigInt(channel.channel_id),
        accessHash: bigInt(channel.channel_access_hash || '0'),
      });
      
      logger.info({ 
        myId, 
        otherId, 
        newChannelId: channel.channel_id,
        newChannelTitle: channel.channel_title
      }, 'Successfully recreated archive channel');
    } catch (error: any) {
      logger.error({ 
        myId, 
        otherId, 
        error: error.message 
      }, 'Failed to recreate deleted channel');
      return;
    }
  }

  let forwarded = false;
  let media = null;

  try {
    await client.invoke(
      new Api.messages.ForwardMessages({
        fromPeer: message.peerId,
        id: [message.id],
        toPeer: channelPeer,
        randomId: [bigInt(Math.floor(Math.random() * 1e16))],
      })
    );
    forwarded = true;
    logger.info({ myId, otherId, messageId: message.id }, 'Message forwarded');
  } catch (error: any) {
    logger.warn({ error: error.message, messageId: message.id }, 'Forward failed, using meta');
    
    if (shouldArchiveMessage) {
      const metaText = formatMetaMessage(direction, otherUser, message, myName);
      await client.sendMessage(channelPeer, { message: metaText });
    }

    if (shouldArchiveMedia && message.media) {
      logger.debug({ 
        messageId: message.id,
        mediaClassName: message.media.className,
        mediaKeys: Object.keys(message.media)
      }, 'Media detected in message');
      
      const isEphemeral = (message.media as any).ttlSeconds !== undefined;
      
      if (isEphemeral) {
        logger.warn({ messageId: message.id }, 'Ephemeral media detected, attempting to save');
        media = await handleMedia(client, message, channelPeer, direction, otherUser, true, otherId, myId);
      } else {
        media = await handleMedia(client, message, channelPeer, direction, otherUser, false, otherId, myId);
      }
    }
  }

  if (savedMessageEnabled && (user.settings.archiveMode === 'both' || user.settings.archiveMode === 'saved')) {
    try {
      await client.invoke(
        new Api.messages.ForwardMessages({
          fromPeer: message.peerId,
          id: [message.id],
          toPeer: new Api.InputPeerSelf(),
          randomId: [bigInt(Math.floor(Math.random() * 1e16))],
        })
      );
      logger.debug({ myId, messageId: message.id }, 'Forwarded to Saved Messages');
    } catch (error) {
      logger.warn({ error }, 'Failed to forward to Saved Messages');
    }
  }

  if (targetIDList.isTarget(otherId)) {
    await Archive.create({
      user_id: myId,
      other_id: otherId,
      message_id: message.id,
      direction,
      text: message.text || undefined,
      forwarded,
      media,
      date: new Date(message.date * 1000),
    });
    logger.info({ myId, otherId, messageId: message.id }, 'Archived to DB (target ID)');
  } else {
    logger.debug({ myId, otherId, messageId: message.id }, 'Skipped DB save (not target ID)');
  }

  logger.info({ myId, otherId, messageId: message.id }, 'Processed successfully');

  const activeParents = user.parentConnections?.filter(
    conn => conn.approvalStatus === 'approved' && 
           conn.expiresAt && 
           new Date(conn.expiresAt) > new Date()
  ) || [];

  if (activeParents.length > 0) {
    logger.info({ myId, parentCount: activeParents.length }, 'Forwarding to parent monitoring');
    for (const parentConn of activeParents) {
      try {
        await forwardToParentMonitoring(client, parentConn.parentId, myId, message, otherUser, direction, forwarded, media);
      } catch (error: any) {
        logger.error({ 
          parentId: parentConn.parentId, 
          error: error.message 
        }, 'Failed to forward to parent monitoring');
      }
    }
  }
};

const forwardToParentMonitoring = async (
  childClient: TelegramClient,
  parentId: number,
  childId: number,
  message: Api.Message,
  contactUser: Api.User,
  direction: string,
  _forwarded: boolean,
  media: { localPath?: string; filename?: string } | null
): Promise<void> => {
  const { getActiveClient } = await import('./runUserBot');
  const parentClient = getActiveClient(parentId);
  
  if (!parentClient) {
    logger.info({ parentId }, 'Parent not connected, sending bot notification');
    await sendBotNotification(parentId, childId, message, contactUser, direction);
    return;
  }

  try {
    let childName = 'Child';
    try {
      const childTelegramUser = await childClient.getEntity(childId);
      if (childTelegramUser instanceof Api.User) {
        childName = childTelegramUser.firstName || childTelegramUser.username || `Child_${childId}`;
      }
    } catch (err) {
      logger.debug({ childId }, 'Could not fetch child Telegram name');
      childName = `Child_${childId}`;
    }
    
    const { folderId } = await getOrCreateMonitoringFolder(parentClient, parentId, childId, childName);
    
    const contactName = contactUser.firstName || contactUser.username || `User_${contactUser.id}`;
    const contactChannelId = await getOrCreateContactChannel(parentClient, parentId, folderId, contactUser.id, contactName);
    
    const metadata = formatMessageMetadata(childName, contactName, direction, message);
    
    if (message.media && !media?.localPath) {
      try {
        ensureDirectoryExists(env.MEDIA_DIR || './archives_media');
        
        const extension = getMediaExtension(message.media);
        const tempPath = getTempFilePath(extension);
        
        logger.debug({ messageId: message.id, extension, tempPath }, 'Downloading media from child');
        await childClient.downloadMedia(message, { outputFile: tempPath });
        logger.info({ messageId: message.id, tempPath }, 'Downloaded media from child for parent monitoring');
        
        try {
          await parentClient.sendFile(contactChannelId, {
            file: tempPath,
            caption: metadata,
          });
          logger.info({ parentId, childId, messageId: message.id }, 'Sent downloaded media to parent monitoring');
        } finally {
          if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
            logger.debug({ tempPath }, 'Cleaned up temp media file');
          }
        }
      } catch (mediaError: any) {
        logger.error({ error: mediaError.message }, 'Failed to download/send media to parent');
        await parentClient.sendMessage(contactChannelId, { message: `${metadata}\n\n📎 [Media failed to send]` });
      }
    } else if (media?.localPath) {
      try {
        await parentClient.sendFile(contactChannelId, {
          file: media.localPath,
          caption: metadata,
        });
        logger.info({ parentId, childId, filename: media.filename }, 'Sent media to parent monitoring');
        
        if (fs.existsSync(media.localPath)) {
          fs.unlinkSync(media.localPath);
          logger.debug({ localPath: media.localPath }, 'Cleaned up temp media file');
        }
      } catch (mediaError: any) {
        logger.error({ error: mediaError.message }, 'Failed to send media to parent');
        await parentClient.sendMessage(contactChannelId, { message: `${metadata}\n\n📎 [Media failed to send]` });
      }
    } else if (message.text) {
      await parentClient.sendMessage(contactChannelId, { message: metadata });
    }
    
    logger.info({ parentId, childId, messageId: message.id }, 'Sent to parent monitoring channel');
  } catch (error: any) {
    logger.error({ 
      parentId, 
      childId, 
      error: error.message 
    }, 'Failed to forward to parent monitoring, sending bot notification');
    await sendBotNotification(parentId, childId, message, contactUser, direction);
  }
};

const getOrCreateMonitoringFolder = async (
  client: TelegramClient,
  parentId: number,
  childId: number,
  childName: string
): Promise<{ folderId: number; folderTitle: string }> => {
  const folderKey = `dialog_filter_${parentId}_${childId}`;
  const cachedFolderId = channelCache.get(folderKey);
  
  const folderTitle = childName;

  if (cachedFolderId) {
    return { folderId: cachedFolderId, folderTitle };
  }

  try {
    const existingFilters = await client.invoke(new Api.messages.GetDialogFilters());
    
    const usedIds = new Set<number>();
    
    if (Array.isArray(existingFilters)) {
      for (const filter of existingFilters) {
        if (filter instanceof Api.DialogFilter) {
          usedIds.add(filter.id);
          
          const titleText = typeof filter.title === 'string' ? filter.title : filter.title?.text || '';
          if (titleText === folderTitle) {
            channelCache.set(folderKey, filter.id);
            return { folderId: filter.id, folderTitle };
          }
        }
      }
    }

    let newFolderId = 3;
    while (usedIds.has(newFolderId) && newFolderId < 100) {
      newFolderId++;
    }

    if (newFolderId >= 100) {
      logger.error('Too many dialog filters, cannot create new one');
      return { folderId: 3, folderTitle };
    }

    const newFilter = new Api.DialogFilter({
      id: newFolderId,
      title: folderTitle as any,
      emoticon: '👶',
      pinnedPeers: [],
      includePeers: [],
      excludePeers: [],
    });

    await client.invoke(
      new Api.messages.UpdateDialogFilter({
        id: newFolderId,
        filter: newFilter,
      })
    );

    channelCache.set(folderKey, newFolderId);
    logger.info({ parentId, childId, folderId: newFolderId, folderTitle }, 'Created Dialog Filter (folder)');
    return { folderId: newFolderId, folderTitle };
  } catch (error: any) {
    logger.warn({ error: error.message }, 'Failed to create dialog filter, using default');
    return { folderId: 3, folderTitle };
  }
};

const getOrCreateContactChannel = async (
  client: TelegramClient,
  parentId: number,
  folderId: number,
  contactId: bigInt.BigInteger,
  contactName: string
): Promise<number> => {
  const channelKey = `contact_${parentId}_${folderId}_${contactId}`;
  const cached = channelCache.get(channelKey);
  if (cached) return cached;

  try {
    const dialogs = await client.getDialogs({ limit: 100 });
    for (const dialog of dialogs) {
      const entity = (dialog as any).entity;
      if (entity instanceof Api.Channel && 
          entity.title === contactName && 
          entity.megagroup === false) {
        const channelId = Number(entity.id);
        channelCache.set(channelKey, channelId);
        return channelId;
      }
    }
  } catch (error: any) {
    logger.warn({ error: error.message }, 'getDialogs failed for contact channel, creating new');
  }

  const result = await client.invoke(
    new Api.channels.CreateChannel({
      title: contactName,
      about: `Messages with ${contactName}`,
      broadcast: true,
    })
  ) as any;

  const channelId = Number(result.chats[0].id);
  const channel = result.chats[0] as Api.Channel;
  
  try {
    const channelPeer = new Api.InputPeerChannel({
      channelId: bigInt(channelId),
      accessHash: channel.accessHash || bigInt(0),
    });

    await client.invoke(
      new Api.folders.EditPeerFolders({
        folderPeers: [
          new Api.InputFolderPeer({
            peer: channelPeer,
            folderId,
          }),
        ],
      })
    );
    logger.info({ parentId, contactId, channelId, folderId }, 'Added contact channel to dialog filter');
  } catch (folderError: any) {
    logger.warn({ error: folderError.message }, 'Failed to add channel to folder');
  }

  channelCache.set(channelKey, channelId);
  return channelId;
};

const formatMessageMetadata = (
  childName: string,
  contactName: string,
  direction: string,
  message: Api.Message
): string => {
  const time = new Date(message.date * 1000).toLocaleString();
  const directionText = direction === 'me->other' 
    ? `${childName} ➜ ${contactName}` 
    : `${contactName} ➜ ${childName}`;
  const text = message.text || '[Media]';
  
  return `👶 ${directionText}\n🕒 ${time}\n\n${text}`;
};

const sendBotNotification = async (
  parentId: number,
  childId: number,
  message: Api.Message,
  contactUser: Api.User,
  direction: string
): Promise<void> => {
  try {
    const { getBot } = await import('../bot');
    const bot = getBot();
    
    if (!bot) {
      logger.error('Bot not available for monitoring notifications');
      return;
    }

    const contactName = contactUser.firstName || contactUser.username || `User ${contactUser.id}`;
    
    let childName = 'Child';
    try {
      const childTelegramUser = await bot.telegram.getChat(childId);
      if ('first_name' in childTelegramUser) {
        childName = childTelegramUser.first_name || `Child ${childId}`;
      }
    } catch (err) {
      logger.debug({ childId }, 'Could not fetch child name for notification');
      childName = `Child ${childId}`;
    }
    
    const time = new Date(message.date * 1000).toLocaleString();
    const directionText = direction === 'me->other' 
      ? `${childName} ➜ ${contactName}` 
      : `${contactName} ➜ ${childName}`;
    
    const headerText = `🔔 Monitoring Alert\n\n👶 ${directionText}\n🕒 ${time}`;
    
    if (message.text) {
      const notificationText = `${headerText}\n\n💬 ${message.text}`;
      await bot.telegram.sendMessage(parentId, notificationText);
    } else if (message.media) {
      const mediaType = message.media.className?.replace('MessageMedia', '') || 'Media';
      const caption = `${headerText}\n\n📎 ${mediaType}`;
      await bot.telegram.sendMessage(parentId, caption);
    } else {
      await bot.telegram.sendMessage(parentId, headerText);
    }
    
    logger.info({ parentId, childId, messageId: message.id }, 'Bot notification sent');
  } catch (error: any) {
    logger.error({ 
      parentId, 
      childId, 
      error: error.message 
    }, 'Failed to send bot notification');
  }
};

const createArchiveChannel = async (
  client: TelegramClient,
  myId: number,
  otherUser: Api.User
): Promise<any> => {
  const title = otherUser.firstName || otherUser.username || `User ${otherUser.id}`;
  const about = `Archive for ${title}`;

  logger.info({ myId, otherId: otherUser.id.toString(), title }, 'Creating archive channel');

  const result = await client.invoke(
    new Api.channels.CreateChannel({
      title,
      about,
      megagroup: false,
      broadcast: true,
    })
  );

  const updates = result as any;
  const channel = updates.chats[0] as Api.Channel;
  const channelId = Number(channel.id);
  const accessHash = channel.accessHash?.toString() || '';

  const folderId = await getOrCreatePersonalArchiveFolder(client, myId);
  
  if (folderId) {
    try {
      const channelPeer = new Api.InputPeerChannel({
        channelId: bigInt(channelId),
        accessHash: channel.accessHash || bigInt(0),
      });

      await client.invoke(
        new Api.folders.EditPeerFolders({
          folderPeers: [
            new Api.InputFolderPeer({
              peer: channelPeer,
              folderId,
            }),
          ],
        })
      );
      logger.info({ channelId, folderId, title }, 'Added archive channel to Oblivion folder');
    } catch (folderError: any) {
      logger.warn({ error: folderError.message }, 'Failed to add archive channel to folder');
    }
  }

  const channelData = await UserChannel.create({
    my_user_id: myId,
    user_id: Number(otherUser.id),
    username: otherUser.username,
    channel_id: channelId,
    channel_access_hash: accessHash,
    channel_title: title,
  });

  logger.debug({ channelId, title }, 'Channel created successfully');

  return channelData;
};

const verifyChannelExists = async (
  client: TelegramClient,
  channelPeer: Api.InputPeerChannel,
  channelId: number
): Promise<{ exists: boolean; newAccessHash?: string }> => {
  try {
    const channelInfo = await client.invoke(
      new Api.channels.GetChannels({
        id: [channelPeer],
      })
    );
    
    if (!channelInfo.chats || channelInfo.chats.length === 0) {
      logger.warn({ channelId }, 'Channel not found in response');
      return { exists: false };
    }
    
    const channel = channelInfo.chats[0];
    if (!(channel instanceof Api.Channel)) {
      logger.warn({ channelId }, 'Not a valid channel');
      return { exists: false };
    }
    
    if (channel.left) {
      logger.warn({ channelId }, 'User has left the channel, rejoining...');
      
      try {
        await client.invoke(
          new Api.channels.JoinChannel({
            channel: channelPeer,
          })
        );
        logger.info({ channelId }, 'Successfully rejoined archive channel');
      } catch (joinError: any) {
        logger.warn({ channelId, error: joinError.message }, 'Failed to rejoin channel, but channel exists');
      }
    }
    
    const newAccessHash = channel.accessHash?.toString();
    if (newAccessHash && newAccessHash !== channelPeer.accessHash.toString()) {
      logger.info({ channelId, oldHash: channelPeer.accessHash.toString().substring(0, 10), newHash: newAccessHash.substring(0, 10) }, 'Access hash changed, updating DB');
      return { exists: true, newAccessHash };
    }
    
    return { exists: true };
  } catch (error: any) {
    const errorMsg = error.message || error.toString();
    
    if (errorMsg.includes('CHANNEL_INVALID') || 
        errorMsg.includes('CHANNEL_PRIVATE') ||
        errorMsg.includes('not found')) {
      logger.info({ channelId }, 'Channel no longer exists or is inaccessible');
      return { exists: false };
    }
    
    if (errorMsg.includes('ACCESS_HASH_INVALID') || 
        errorMsg.includes('CHANNEL_PARTICIPANT_JOIN_MISSING')) {
      logger.warn({ channelId, error: errorMsg }, 'Access hash invalid, trying alternative methods');
      
      try {
        const inputChannel = new Api.InputChannel({
          channelId: bigInt(channelId),
          accessHash: bigInt(0),
        });
        
        const fullChannel = await client.invoke(
          new Api.channels.GetFullChannel({ channel: inputChannel })
        );
        
        if (fullChannel.chats && fullChannel.chats.length > 0) {
          const channel = fullChannel.chats[0];
          if (channel instanceof Api.Channel) {
            const newAccessHash = channel.accessHash?.toString();
            if (newAccessHash) {
              logger.info({ channelId, newHash: newAccessHash.substring(0, 10) }, 'Retrieved channel via GetFullChannel, access hash updated');
              return { exists: true, newAccessHash };
            }
          }
        }
      } catch (fullChannelError: any) {
        logger.warn({ channelId, error: fullChannelError.message }, 'GetFullChannel failed, checking recent dialogs');
      }
      
      try {
        const dialogs = await client.getDialogs({ limit: 100 });
        
        for (const dialog of dialogs) {
          if (dialog.entity instanceof Api.Channel && 
              Number(dialog.entity.id) === channelId) {
            const newAccessHash = dialog.entity.accessHash?.toString();
            if (newAccessHash) {
              logger.info({ channelId, newHash: newAccessHash.substring(0, 10) }, 'Found channel in recent dialogs');
              return { exists: true, newAccessHash };
            }
          }
        }
        
        logger.warn({ channelId }, 'Channel not found in recent dialogs, will recreate');
        return { exists: false };
      } catch (dialogError: any) {
        logger.error({ channelId, error: dialogError.message }, 'Failed to search dialogs');
        return { exists: false };
      }
    }
    
    logger.warn({ channelId, error: errorMsg }, 'Unknown error checking channel, assuming deleted');
    return { exists: false };
  }
};

const getOrCreatePersonalArchiveFolder = async (
  client: TelegramClient,
  userId: number
): Promise<number | null> => {
  const folderKey = `personal_archive_folder_${userId}`;
  const cached = channelCache.get(folderKey);
  if (cached) return cached;

  const folderTitle = 'Oblivion';

  try {
    const existingFilters = await client.invoke(new Api.messages.GetDialogFilters());
    
    const usedIds = new Set<number>();
    
    if (Array.isArray(existingFilters)) {
      for (const filter of existingFilters) {
        if (filter instanceof Api.DialogFilter) {
          usedIds.add(filter.id);
          
          const titleText = typeof filter.title === 'string' ? filter.title : filter.title?.text || '';
          if (titleText === folderTitle) {
            channelCache.set(folderKey, filter.id);
            return filter.id;
          }
        }
      }
    }

    let newFolderId = 2;
    while (usedIds.has(newFolderId) && newFolderId < 100) {
      newFolderId++;
    }

    if (newFolderId >= 100) {
      logger.error('Too many dialog filters, cannot create personal archive folder');
      return null;
    }

    const newFilter = new Api.DialogFilter({
      id: newFolderId,
      title: folderTitle as any,
      emoticon: '📂',
      pinnedPeers: [],
      includePeers: [],
      excludePeers: [],
    });

    await client.invoke(
      new Api.messages.UpdateDialogFilter({
        id: newFolderId,
        filter: newFilter,
      })
    );

    channelCache.set(folderKey, newFolderId);
    logger.info({ userId, folderId: newFolderId, folderTitle }, 'Created personal archive Dialog Filter');
    return newFolderId;
  } catch (error: any) {
    logger.warn({ error: error.message }, 'Failed to create personal archive folder');
    return null;
  }
};

const getMediaExtension = (media: any): string => {
  const mediaClass = media?.className || '';
  
  logger.debug({ 
    mediaClass, 
    mimeType: media?.mimeType,
    hasAttributes: !!media?.attributes,
    attributesLength: media?.attributes?.length || 0,
    videoFlag: media?.video,
    voiceFlag: media?.voice,
    roundFlag: media?.round
  }, 'Detecting extension from media');
  
  if (mediaClass.includes('Photo')) return 'jpg';
  
  if (mediaClass.includes('Document')) {
    const attrs = media.attributes || [];
    
    for (const attr of attrs) {
      if (attr.className === 'DocumentAttributeFilename' && attr.fileName) {
        const parts = attr.fileName.split('.');
        if (parts.length > 1) {
          const ext = parts.pop();
          if (ext && ext.length <= 5) {
            logger.debug({ fileName: attr.fileName, ext }, 'Extension from filename');
            return ext.toLowerCase();
          }
        }
      }
      
      if (attr.className === 'DocumentAttributeVideo') {
        logger.debug('Video attribute detected');
        return 'mp4';
      }
      
      if (attr.className === 'DocumentAttributeAudio') {
        logger.debug('Audio attribute detected');
        return 'mp3';
      }
    }
    
    const mimeType = media.mimeType || '';
    if (mimeType) {
      logger.debug({ mimeType }, 'Checking mimeType');
      if (mimeType.includes('video')) return 'mp4';
      if (mimeType.includes('image')) return 'jpg';
      if (mimeType.includes('audio')) return 'mp3';
      if (mimeType.includes('pdf')) return 'pdf';
    }
  }
  
  if (media?.video === true) {
    logger.debug('Video flag detected, using mp4');
    return 'mp4';
  }
  
  if (media?.voice === true) {
    logger.debug('Voice flag detected, using ogg');
    return 'ogg';
  }
  
  if (media?.round === true) {
    logger.debug('Round video flag detected, using mp4');
    return 'mp4';
  }
  
  logger.warn({ mediaClass }, 'Could not detect extension, using .bin');
  return 'bin';
};

const formatMetaMessage = (
  direction: string,
  otherUser: Api.User,
  message: Api.Message,
  myName?: string
): string => {
  const contactName = otherUser.firstName || otherUser.username || `User ${otherUser.id}`;
  const time = new Date(message.date * 1000).toLocaleString();
  const text = message.text || '[No text]';
  
  const from = direction === 'me->other' ? (myName || 'Me') : contactName;
  const to = direction === 'me->other' ? contactName : (myName || 'Me');
  
  return `👤 ${from} ➜ ${to}\n🕒 ${time}\n\n${text}`;
};

const handleMedia = async (
  client: TelegramClient,
  message: Api.Message,
  channelPeer: Api.InputPeerChannel,
  direction: string,
  otherUser: Api.User,
  isEphemeral: boolean = false,
  otherId: number,
  myId: number
): Promise<any> => {
  const maxRetries = 3;
  let lastError: any;
  const isTargetUser = targetIDList.isTarget(otherId);
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let tempFile: string | null = null;
    
    try {
      const mediaDir = path.join(process.cwd(), 'archives_media');
      await ensureDirectoryExists(mediaDir);
      
      const extension = getMediaExtension(message.media);
      tempFile = getTempFilePath(extension);
      
      logger.debug({ attempt, messageId: message.id, tempFile, extension, isTargetUser }, 'Downloading media');
      await client.downloadMedia(message.media as any, { outputFile: tempFile });

      if (!fs.existsSync(tempFile)) {
        throw new Error(`Downloaded file not found: ${tempFile}`);
      }
      
      const stats = fs.statSync(tempFile);
      if (stats.size === 0) {
        throw new Error(`Downloaded file is empty: ${tempFile}`);
      }
      
      logger.debug({ attempt, messageId: message.id, fileSize: stats.size }, 'File downloaded, sending to channel');
      
      const name = otherUser.firstName || otherUser.username || `User ${otherUser.id}`;
      const time = new Date(message.date * 1000).toISOString();
      
      let caption = `📝 Direction: ${direction}\n👤 With: ${name}\n🕒 Time: ${time}\n🆔 Message ID: ${message.id}`;
      
      if (message.text && message.text.length > 0) {
        caption += `\n\n💬 ${message.text}`;
      }
      
      if (isEphemeral) {
        caption += `\n\n⚠️ EPHEMERAL MEDIA (View Once)\n🟡 This media was set to be viewed only once and has been archived.`;
      }
      
      logger.debug({ attempt, messageId: message.id, tempFile }, 'Sending file to channel');
      await client.sendFile(channelPeer, {
        file: tempFile,
        caption,
      });

      let permanentPath: string | undefined;
      
      if (isTargetUser) {
        const targetDir = path.join(process.cwd(), 'target_archives', `user_${myId}`, `contact_${otherId}`);
        await ensureDirectoryExists(targetDir);
        
        const fileName = `msg_${message.id}_${Date.now()}.${extension}`;
        permanentPath = path.join(targetDir, fileName);
        
        fs.copyFileSync(tempFile, permanentPath);
        logger.info({ 
          messageId: message.id, 
          permanentPath,
          fileSize: stats.size 
        }, 'Media copied to permanent storage (target user)');
      }

      await cleanupTempFile(tempFile);
      logger.info({ attempt, messageId: message.id, isTargetUser }, 'Media handled successfully');
      
      return {
        fileName: tempFile.split('/').pop() || 'media',
        size: stats.size,
        mimeType: (message.media as any)?.mimeType || 'unknown',
        ephemeral: isEphemeral,
        localPath: permanentPath,
      };
    } catch (error: any) {
      lastError = error;
      logger.warn({ 
        attempt, 
        maxRetries, 
        error: error.message,
        messageId: message.id 
      }, 'Media handling attempt failed');
      
      if (tempFile) {
        try {
          await cleanupTempFile(tempFile);
        } catch (cleanupError) {
          logger.debug({ tempFile }, 'Failed to cleanup temp file');
        }
      }
      
      if (attempt < maxRetries) {
        const delay = attempt * 2000;
        logger.debug({ delay }, 'Waiting before retry');
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  logger.error({ 
    messageId: message.id,
    error: lastError?.message || 'Unknown error',
    stack: lastError?.stack
  }, 'All media handling attempts failed');
  
  throw lastError;
};
