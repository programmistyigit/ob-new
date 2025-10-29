import { TelegramClient } from 'telegram';
import { Api } from 'telegram/tl';
import { NewMessage } from 'telegram/events';
import { NewMessageEvent } from 'telegram/events';
import { createLogger } from '../utils/logger';
import { BotUser } from '../mongodb/bot.user.schema';
import bigInt from 'big-integer';

const logger = createLogger('GroupArchiveHandler');

const groupChannelCache = new Map<string, { channelId: number; accessHash: string }>();
const messageIdMap = new Map<string, Map<number, number>>();

export const setupGroupArchiveHandler = (client: TelegramClient, userId: number) => {
  logger.info({ userId }, 'Group archive handler setup started');

  client.addEventHandler(async (event: NewMessageEvent) => {
    try {
      const message = event.message;
      
      if (!message.peerId) {
        return;
      }

      if (!(message.peerId instanceof Api.PeerChannel) && !(message.peerId instanceof Api.PeerChat)) {
        return;
      }

      await handleGroupMessage(client, userId, message);
    } catch (error: any) {
      logger.error({ 
        error: error.message || error.toString(), 
        stack: error.stack,
        userId 
      }, 'Error in group archive handler');
    }
  }, new NewMessage({}));
};

const handleGroupMessage = async (
  client: TelegramClient,
  userId: number,
  message: Api.Message
): Promise<void> => {
  const user = await BotUser.findOne({ userId });
  if (!user || user.status !== 'active') {
    return;
  }

  let groupChatId: number;
  
  if (message.peerId instanceof Api.PeerChannel) {
    const channelId = Number(message.peerId.channelId);
    groupChatId = -1000000000000 - channelId;
  } else if (message.peerId instanceof Api.PeerChat) {
    const chatId = Number(message.peerId.chatId);
    groupChatId = -chatId;
  } else {
    return;
  }

  const groupConfig = user.groupArchive?.find(g => g.chatId === groupChatId);
  if (!groupConfig) {
    logger.debug({ userId, groupChatId, stored: user.groupArchive?.map(g => g.chatId) }, 'Group not in archive config');
    return;
  }

  const hasText = message.text && message.text.length > 0;
  const hasMedia = !!message.media;

  const shouldArchiveMessage = groupConfig.archiveMessages && hasText;
  const shouldArchiveMedia = groupConfig.archiveMedia && hasMedia;

  if (!shouldArchiveMessage && !shouldArchiveMedia) {
    return;
  }

  let archiveChannel: { channelId: number; accessHash: string } | undefined = groupChannelCache.get(`${userId}_${groupChatId}`);
  
  if (!archiveChannel) {
    const newChannel = await getOrCreateGroupArchiveChannel(client, userId, groupChatId, groupConfig.title);
    if (!newChannel) {
      logger.error({ userId, groupChatId }, 'Failed to get or create archive channel');
      return;
    }
    
    archiveChannel = newChannel;
    
    await BotUser.findOneAndUpdate(
      { userId, 'groupArchive.chatId': groupChatId },
      { $set: { 'groupArchive.$.channelId': archiveChannel.channelId } }
    );
    
    groupChannelCache.set(`${userId}_${groupChatId}`, archiveChannel);
  }

  const channelPeer = new Api.InputPeerChannel({
    channelId: bigInt(archiveChannel.channelId),
    accessHash: bigInt(archiveChannel.accessHash),
  });

  if ((message as any).groupedId) {
    await handleMediaGroup(client, userId, message, channelPeer, groupChatId);
  } else {
    await archiveSingleMessage(client, userId, message, channelPeer, groupChatId, groupConfig.title);
  }
};

const archiveSingleMessage = async (
  client: TelegramClient,
  userId: number,
  message: Api.Message,
  channelPeer: Api.InputPeerChannel,
  groupChatId: number,
  groupTitle: string
): Promise<void> => {
  try {
    const forwardResult = await client.invoke(
      new Api.messages.ForwardMessages({
        fromPeer: message.peerId!,
        id: [message.id],
        toPeer: channelPeer,
        randomId: [bigInt(Math.floor(Math.random() * 1e16))],
        dropAuthor: false,
      })
    );

    if (forwardResult instanceof Api.Updates) {
      const newMessageId = extractNewMessageId(forwardResult);
      if (newMessageId && message.replyTo) {
        await handleReplyChain(client, userId, message, channelPeer, groupChatId, newMessageId);
      }
      
      if (newMessageId) {
        const mapKey = `${userId}_${groupChatId}`;
        if (!messageIdMap.has(mapKey)) {
          messageIdMap.set(mapKey, new Map());
        }
        messageIdMap.get(mapKey)!.set(message.id, newMessageId);
      }
    }

    logger.info({ userId, groupChatId, messageId: message.id }, 'Message forwarded to group archive');
  } catch (error: any) {
    logger.warn({ error: error.message, messageId: message.id }, 'Forward failed, using metadata');
    await sendMetadataMessage(client, message, channelPeer, groupTitle, userId, groupChatId);
  }
};

const handleReplyChain = async (
  client: TelegramClient,
  userId: number,
  message: Api.Message,
  channelPeer: Api.InputPeerChannel,
  groupChatId: number,
  initialMessageId: number
): Promise<void> => {
  if (!message.replyTo || !(message.replyTo instanceof Api.MessageReplyHeader)) {
    return;
  }

  const replyToMsgId = message.replyTo.replyToMsgId;
  if (!replyToMsgId) {
    return;
  }

  const mapKey = `${userId}_${groupChatId}`;
  const idMap = messageIdMap.get(mapKey);
  
  if (idMap && idMap.has(replyToMsgId)) {
    const archivedReplyId = idMap.get(replyToMsgId)!;
    
    try {
      const reforwardResult = await client.invoke(
        new Api.messages.ForwardMessages({
          fromPeer: message.peerId!,
          id: [message.id],
          toPeer: channelPeer,
          randomId: [bigInt(Math.floor(Math.random() * 1e16))],
          topMsgId: archivedReplyId,
          dropAuthor: false
        })
      );
      
      let newArchivedId: number | null = null;
      if (reforwardResult instanceof Api.Updates) {
        newArchivedId = extractNewMessageId(reforwardResult);
      }
      
      if (newArchivedId) {
        idMap.set(message.id, newArchivedId);
        
        await client.invoke(
          new Api.channels.DeleteMessages({
            channel: channelPeer,
            id: [initialMessageId]
          })
        );

        logger.info({ 
          userId, 
          groupChatId, 
          originalMsg: message.id, 
          replyTo: replyToMsgId,
          newArchivedId 
        }, 'Reply chain preserved and messageIdMap updated');
      } else {
        logger.warn({ userId, groupChatId }, 'Could not extract new message ID from reforward');
      }
    } catch (error: any) {
      logger.warn({ error: error.message }, 'Failed to preserve reply chain, keeping original forward');
    }
  }
};

const handleMediaGroup = async (
  client: TelegramClient,
  userId: number,
  message: Api.Message,
  channelPeer: Api.InputPeerChannel,
  groupChatId: number
): Promise<void> => {
  const groupedId = (message as any).groupedId;
  const cacheKey = `${userId}_${groupChatId}_${groupedId}`;
  
  const existingGroup = (handleMediaGroup as any).pendingGroups?.get(cacheKey);
  if (existingGroup) {
    return;
  }

  if (!(handleMediaGroup as any).pendingGroups) {
    (handleMediaGroup as any).pendingGroups = new Map();
  }

  (handleMediaGroup as any).pendingGroups.set(cacheKey, true);

  setTimeout(async () => {
    try {
      const messages = await client.getMessages(message.peerId!, {
        ids: [message.id]
      });

      const mediaGroupMessages: Api.Message[] = [];
      
      if (messages && messages.length > 0) {
        const allMessages = await client.getMessages(message.peerId!, {
          limit: 100
        });

        for (const msg of allMessages) {
          if ((msg as any).groupedId?.toString() === groupedId.toString()) {
            mediaGroupMessages.push(msg);
          }
        }
      }

      if (mediaGroupMessages.length > 0) {
        const messageIds = mediaGroupMessages.map(m => m.id);
        
        try {
          await client.invoke(
            new Api.messages.ForwardMessages({
              fromPeer: message.peerId!,
              id: messageIds,
              toPeer: channelPeer,
              randomId: messageIds.map(() => bigInt(Math.floor(Math.random() * 1e16))),
              dropAuthor: false,
            })
          );
          
          logger.info({ userId, groupChatId, groupedId, count: messageIds.length }, 'Media group forwarded');
        } catch (error: any) {
          logger.error({ error: error.message }, 'Failed to forward media group');
        }
      }
    } catch (error: any) {
      logger.error({ error: error.message }, 'Error handling media group');
    } finally {
      (handleMediaGroup as any).pendingGroups.delete(cacheKey);
    }
  }, 1000);
};

const sendMetadataMessage = async (
  client: TelegramClient,
  message: Api.Message,
  channelPeer: Api.InputPeerChannel,
  groupTitle: string,
  userId: number,
  groupChatId: number
): Promise<void> => {
  let senderName = 'Unknown';
  try {
    const sender = await client.getEntity(message.fromId!);
    if (sender instanceof Api.User) {
      senderName = sender.firstName || sender.username || 'Unknown';
    }
  } catch (error) {
    logger.debug({ error }, 'Could not fetch sender name');
  }

  const timestamp = new Date(message.date * 1000).toLocaleString('uz-UZ', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  let metaText = `📋 Metadata Archive\n`;
  metaText += `👤 From: ${senderName}\n`;
  metaText += `📂 Group: ${groupTitle}\n`;
  metaText += `🕒 Time: ${timestamp}\n`;
  metaText += `📨 Message ID: ${message.id}\n`;
  
  if (message.text) {
    metaText += `\n💬 Text:\n${message.text}`;
  }
  
  if (message.media) {
    const mediaType = message.media.className;
    metaText += `\n🎨 Media Type: ${mediaType}`;
  }

  try {
    let replyToMsgId: number | undefined;
    
    if (message.replyTo && message.replyTo instanceof Api.MessageReplyHeader) {
      const originalReplyId = message.replyTo.replyToMsgId;
      if (originalReplyId) {
        const mapKey = `${userId}_${groupChatId}`;
        const idMap = messageIdMap.get(mapKey);
        if (idMap && idMap.has(originalReplyId)) {
          replyToMsgId = idMap.get(originalReplyId);
        }
      }
    }

    const sentMsg = await client.sendMessage(channelPeer, { 
      message: metaText,
      ...(replyToMsgId && { replyTo: replyToMsgId })
    });

    if (sentMsg && (sentMsg as any).id) {
      const mapKey = `${userId}_${groupChatId}`;
      if (!messageIdMap.has(mapKey)) {
        messageIdMap.set(mapKey, new Map());
      }
      messageIdMap.get(mapKey)!.set(message.id, (sentMsg as any).id);
    }

    logger.info({ userId, groupChatId, messageId: message.id }, 'Metadata message sent with reply');
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to send metadata message');
  }
};

const getOrCreateGroupArchiveChannel = async (
  client: TelegramClient,
  userId: number,
  groupChatId: number,
  groupTitle: string
): Promise<{ channelId: number; accessHash: string } | null> => {
  const user = await BotUser.findOne({ userId });
  if (!user) return null;

  const groupConfig = user.groupArchive?.find(g => g.chatId === groupChatId);
  if (!groupConfig) return null;

  if (groupConfig.channelId) {
    try {
      const channel = await client.getEntity(groupConfig.channelId);
      if (channel instanceof Api.Channel) {
        const accessHash = channel.accessHash?.toString() || '0';
        return {
          channelId: groupConfig.channelId,
          accessHash
        };
      }
    } catch (error) {
      logger.debug({ userId, channelId: groupConfig.channelId }, 'Existing channel not accessible, creating new');
    }
  }

  try {
    const result = await client.invoke(
      new Api.channels.CreateChannel({
        title: `Archive: ${groupTitle}`,
        about: `Automatic archive for ${groupTitle} group messages`,
        broadcast: true,
      })
    );

    let newChannelId: number | null = null;
    let newAccessHash: string | null = null;

    if (result instanceof Api.Updates) {
      for (const chat of result.chats) {
        if (chat instanceof Api.Channel) {
          newChannelId = Number(chat.id);
          newAccessHash = chat.accessHash?.toString() || '0';
          break;
        }
      }
    }

    if (!newChannelId || !newAccessHash) {
      logger.error({ userId, groupChatId }, 'Failed to extract channel info from creation result');
      return null;
    }

    logger.info({ 
      userId, 
      groupChatId, 
      channelId: newChannelId,
      title: `Archive: ${groupTitle}`
    }, 'Group archive channel created');

    return {
      channelId: newChannelId,
      accessHash: newAccessHash
    };
  } catch (error: any) {
    logger.error({ 
      userId, 
      groupChatId, 
      error: error.message 
    }, 'Failed to create group archive channel');
    return null;
  }
};

const extractNewMessageId = (updates: Api.Updates): number | null => {
  for (const update of updates.updates) {
    if (update instanceof Api.UpdateNewChannelMessage) {
      return update.message.id;
    }
    if (update instanceof Api.UpdateNewMessage) {
      return update.message.id;
    }
  }
  return null;
};
