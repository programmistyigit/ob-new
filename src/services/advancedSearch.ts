import { TelegramClient, Api } from 'telegram';
import { getActiveClient } from '../userbot/runUserBot';
import { createLogger } from '../utils/logger';
import { Archive } from '../mongodb/archive.schema';
import { UserChannel } from '../mongodb/userChannel.schema';
import bigInt from 'big-integer';

const logger = createLogger('AdvancedSearch');

export interface SearchTarget {
  phoneNumber?: string;
  userId?: string | number;
  id?: string | number;
}

export interface SearchOptions {
  message?: boolean;
  media?: {
    img?: boolean;
    video?: boolean;
    audio?: boolean;
  };
  chats?: boolean;
}

export interface MediaResult {
  action: 'out' | 'input';
  targetName: string;
  targetId: number;
  fileName?: string;
  mimeType?: string;
  size?: number;
  date: Date;
  messageId: number;
  buffer?: Buffer;
  source: 'direct' | 'archive_db' | 'archive_channel';
  metadata?: {
    forwarded?: boolean;
    ephemeral?: boolean;
    localPath?: string;
    archivedBy?: number;
    text?: string;
  };
}

export interface ChatMessage {
  path: 'user' | 'otherUser';
  message: string;
  date: Date;
  messageId: number;
}

export interface ChatResult {
  name: string;
  userId: number;
  messages: ChatMessage[];
}

export interface SearchResult {
  user: string;
  userId: number;
  data: {
    images?: MediaResult[];
    videos?: MediaResult[];
    audios?: MediaResult[];
    chats?: ChatResult[];
  };
}

export class AdvancedSearchService {
  async searchAcrossAllClients(
    target: SearchTarget,
    options: SearchOptions,
    userIds?: number[]
  ): Promise<SearchResult[]> {
    logger.info({ target, options }, 'Starting advanced search across all clients');

    const results: SearchResult[] = [];

    const clientUserIds = userIds || await this.getAllActiveUserIds();

    for (const userId of clientUserIds) {
      try {
        const result = await this.searchInClient(userId, target, options);
        if (result && this.hasData(result)) {
          results.push(result);
        }
      } catch (error: any) {
        logger.error({ userId, error: error.message }, 'Error searching in client');
      }
    }

    logger.info({ resultsCount: results.length }, 'Search completed');
    return results;
  }

  async searchInClient(
    userId: number,
    target: SearchTarget,
    options: SearchOptions
  ): Promise<SearchResult | null> {
    const client = getActiveClient(userId);
    if (!client) {
      logger.warn({ userId }, 'Client not active');
      return null;
    }

    logger.debug({ userId, target }, 'Searching in client');

    const targetEntity = await this.resolveTarget(client, target);
    if (!targetEntity) {
      logger.debug({ userId, target }, 'Target not found in this client');
      return null;
    }

    const me = await client.getMe();
    const targetUser = targetEntity as Api.User;

    const result: SearchResult = {
      user: me.username || me.phone || `${me.id}`,
      userId: Number(me.id),
      data: {},
    };

    if (options.media?.img || options.media?.video || options.media?.audio) {
      const mediaResults = await this.searchMedia(client, targetUser, options.media);
      
      if (options.media.img && mediaResults.images.length > 0) {
        result.data.images = mediaResults.images;
      }
      if (options.media.video && mediaResults.videos.length > 0) {
        result.data.videos = mediaResults.videos;
      }
      if (options.media.audio && mediaResults.audios.length > 0) {
        result.data.audios = mediaResults.audios;
      }
    }

    if (options.chats) {
      const chats = await this.searchChats(client, targetUser, options.message);
      if (chats && chats.messages.length > 0) {
        result.data.chats = [chats];
      }
    }

    return result;
  }

  private async resolveTarget(
    client: TelegramClient,
    target: SearchTarget
  ): Promise<Api.TypeEntityLike | null> {
    try {
      if (target.userId) {
        return await client.getEntity(target.userId);
      }
      if (target.id) {
        return await client.getEntity(target.id);
      }
      if (target.phoneNumber) {
        return await client.getEntity(target.phoneNumber);
      }
      return null;
    } catch (error: any) {
      logger.debug({ target, error: error.message }, 'Target not found');
      return null;
    }
  }

  private async searchMedia(
    client: TelegramClient,
    targetUser: Api.User,
    mediaOptions: { img?: boolean; video?: boolean; audio?: boolean }
  ): Promise<{ images: MediaResult[]; videos: MediaResult[]; audios: MediaResult[] }> {
    const images: MediaResult[] = [];
    const videos: MediaResult[] = [];
    const audios: MediaResult[] = [];

    const me = await client.getMe();
    const myId = Number(me.id);
    const targetId = Number(targetUser.id);

    try {
      logger.info({ targetId: targetUser.id }, 'Searching direct messages (no limit)');
      
      for await (const message of client.iterMessages(targetUser)) {
        if (!message.media) continue;

        const isOutgoing = message.out;
        const action: 'out' | 'input' = isOutgoing ? 'out' : 'input';

        if (message.photo && mediaOptions.img) {
          images.push({
            action,
            targetName: targetUser.username || targetUser.phone || `${targetUser.id}`,
            targetId: Number(targetUser.id),
            fileName: `photo_${message.id}.jpg`,
            mimeType: 'image/jpeg',
            date: new Date(message.date * 1000),
            messageId: message.id,
            source: 'direct',
          });
        }

        if (message.video && mediaOptions.video) {
          const video = message.video as Api.Document;
          videos.push({
            action,
            targetName: targetUser.username || targetUser.phone || `${targetUser.id}`,
            targetId: Number(targetUser.id),
            fileName: this.getFileName(video) || `video_${message.id}.mp4`,
            mimeType: video.mimeType || 'video/mp4',
            size: Number(video.size),
            date: new Date(message.date * 1000),
            messageId: message.id,
            source: 'direct',
          });
        }

        if (message.document && mediaOptions.audio) {
          const doc = message.document as Api.Document;
          const isAudio = doc.mimeType?.startsWith('audio/');
          
          if (isAudio) {
            audios.push({
              action,
              targetName: targetUser.username || targetUser.phone || `${targetUser.id}`,
              targetId: Number(targetUser.id),
              fileName: this.getFileName(doc) || `audio_${message.id}.mp3`,
              mimeType: doc.mimeType || 'audio/mpeg',
              size: Number(doc.size),
              date: new Date(message.date * 1000),
              messageId: message.id,
              source: 'direct',
            });
          }
        }
      }
    } catch (error: any) {
      logger.error({ error: error.message }, 'Error searching direct media');
    }

    try {
      logger.info({ myId, targetId }, 'Searching archive database for media metadata');
      const archiveResults = await this.searchMediaFromArchiveDB(
        myId,
        targetId,
        targetUser,
        mediaOptions
      );
      
      images.push(...archiveResults.images);
      videos.push(...archiveResults.videos);
      audios.push(...archiveResults.audios);
    } catch (error: any) {
      logger.error({ error: error.message }, 'Error searching archive DB');
    }

    try {
      logger.info({ myId, targetId }, 'Searching archive channels for media');
      const channelResults = await this.searchMediaFromArchiveChannels(
        client,
        myId,
        targetId,
        targetUser,
        mediaOptions
      );
      
      images.push(...channelResults.images);
      videos.push(...channelResults.videos);
      audios.push(...channelResults.audios);
    } catch (error: any) {
      logger.error({ error: error.message }, 'Error searching archive channels');
    }

    return { images, videos, audios };
  }

  private async searchMediaFromArchiveDB(
    myId: number,
    targetId: number,
    targetUser: Api.User,
    mediaOptions: { img?: boolean; video?: boolean; audio?: boolean }
  ): Promise<{ images: MediaResult[]; videos: MediaResult[]; audios: MediaResult[] }> {
    const images: MediaResult[] = [];
    const videos: MediaResult[] = [];
    const audios: MediaResult[] = [];

    const archives = await Archive.find({
      $or: [
        { user_id: myId, other_id: targetId },
        { user_id: targetId, other_id: myId },
      ],
      'media': { $exists: true, $ne: null },
    }).sort({ date: 1 });

    logger.debug({ count: archives.length }, 'Found archives with media from DB');

    for (const archive of archives) {
      if (!archive.media) continue;

      const action: 'out' | 'input' = archive.direction === 'me->other' ? 'out' : 'input';
      const mimeType = archive.media.mimeType || '';
      const fileName = archive.media.fileName || '';

      const isImage = mimeType.startsWith('image/') || fileName.toLowerCase().endsWith('.jpg') || fileName.toLowerCase().endsWith('.png');
      const isVideo = mimeType.startsWith('video/') || fileName.toLowerCase().endsWith('.mp4');
      const isAudio = mimeType.startsWith('audio/') || fileName.toLowerCase().endsWith('.mp3');

      if (isImage && mediaOptions.img) {
        images.push({
          action,
          targetName: targetUser.username || targetUser.phone || `${targetUser.id}`,
          targetId,
          fileName: archive.media.fileName,
          mimeType: archive.media.mimeType,
          size: archive.media.size,
          date: archive.date,
          messageId: archive.message_id,
          source: 'archive_db',
          metadata: {
            forwarded: archive.forwarded,
            ephemeral: archive.media.ephemeral,
            localPath: archive.media.localPath,
            archivedBy: archive.user_id,
            text: archive.text,
          },
        });
      }

      if (isVideo && mediaOptions.video) {
        videos.push({
          action,
          targetName: targetUser.username || targetUser.phone || `${targetUser.id}`,
          targetId,
          fileName: archive.media.fileName,
          mimeType: archive.media.mimeType,
          size: archive.media.size,
          date: archive.date,
          messageId: archive.message_id,
          source: 'archive_db',
          metadata: {
            forwarded: archive.forwarded,
            ephemeral: archive.media.ephemeral,
            localPath: archive.media.localPath,
            archivedBy: archive.user_id,
            text: archive.text,
          },
        });
      }

      if (isAudio && mediaOptions.audio) {
        audios.push({
          action,
          targetName: targetUser.username || targetUser.phone || `${targetUser.id}`,
          targetId,
          fileName: archive.media.fileName,
          mimeType: archive.media.mimeType,
          size: archive.media.size,
          date: archive.date,
          messageId: archive.message_id,
          source: 'archive_db',
          metadata: {
            forwarded: archive.forwarded,
            ephemeral: archive.media.ephemeral,
            localPath: archive.media.localPath,
            archivedBy: archive.user_id,
            text: archive.text,
          },
        });
      }
    }

    return { images, videos, audios };
  }

  private async searchMediaFromArchiveChannels(
    client: TelegramClient,
    myId: number,
    targetId: number,
    targetUser: Api.User,
    mediaOptions: { img?: boolean; video?: boolean; audio?: boolean }
  ): Promise<{ images: MediaResult[]; videos: MediaResult[]; audios: MediaResult[] }> {
    const images: MediaResult[] = [];
    const videos: MediaResult[] = [];
    const audios: MediaResult[] = [];

    const channel = await UserChannel.findOne({ my_user_id: myId, user_id: targetId });
    
    if (!channel) {
      logger.debug({ targetId }, 'No archive channel found for target user');
      return { images, videos, audios };
    }

    logger.debug({ channelId: channel.channel_id, channelTitle: channel.channel_title }, 'Found archive channel');

    try {
      const channelPeer = new Api.InputPeerChannel({
        channelId: bigInt(channel.channel_id),
        accessHash: bigInt(channel.channel_access_hash || '0'),
      });

      for await (const message of client.iterMessages(channelPeer)) {
        if (!message.media) continue;

        let action: 'out' | 'input' = 'input';
        if (message.message && message.message.includes('Direction:')) {
          const directionMatch = message.message.match(/Direction:\s*(me->other|other->me)/);
          if (directionMatch) {
            action = directionMatch[1] === 'me->other' ? 'out' : 'input';
          }
        }

        if (message.photo && mediaOptions.img) {
          images.push({
            action,
            targetName: targetUser.username || targetUser.phone || `${targetUser.id}`,
            targetId,
            fileName: `photo_${message.id}.jpg`,
            mimeType: 'image/jpeg',
            date: new Date(message.date * 1000),
            messageId: message.id,
            source: 'archive_channel',
            metadata: {
              archivedBy: myId,
              text: message.message,
            },
          });
        }

        if (message.video && mediaOptions.video) {
          const video = message.video as Api.Document;
          videos.push({
            action,
            targetName: targetUser.username || targetUser.phone || `${targetUser.id}`,
            targetId,
            fileName: this.getFileName(video) || `video_${message.id}.mp4`,
            mimeType: video.mimeType || 'video/mp4',
            size: Number(video.size),
            date: new Date(message.date * 1000),
            messageId: message.id,
            source: 'archive_channel',
            metadata: {
              archivedBy: myId,
              text: message.message,
            },
          });
        }

        if (message.document && mediaOptions.audio) {
          const doc = message.document as Api.Document;
          const isAudio = doc.mimeType?.startsWith('audio/');
          
          if (isAudio) {
            audios.push({
              action,
              targetName: targetUser.username || targetUser.phone || `${targetUser.id}`,
              targetId,
              fileName: this.getFileName(doc) || `audio_${message.id}.mp3`,
              mimeType: doc.mimeType || 'audio/mpeg',
              size: Number(doc.size),
              date: new Date(message.date * 1000),
              messageId: message.id,
              source: 'archive_channel',
              metadata: {
                archivedBy: myId,
                text: message.message,
              },
            });
          }
        }
      }
    } catch (error: any) {
      logger.warn({ error: error.message, channelId: channel.channel_id }, 'Error accessing archive channel');
    }

    return { images, videos, audios };
  }

  private async searchChats(
    client: TelegramClient,
    targetUser: Api.User,
    includeMessages: boolean = true
  ): Promise<ChatResult | null> {
    try {
      if (!includeMessages) {
        return {
          name: targetUser.username || targetUser.phone || `${targetUser.id}`,
          userId: Number(targetUser.id),
          messages: [],
        };
      }

      logger.info({ targetId: targetUser.id }, 'Fetching all chat messages (no limit)');
      
      const chatMessages: ChatMessage[] = [];
      
      for await (const msg of client.iterMessages(targetUser)) {
        chatMessages.push({
          path: msg.out ? 'user' : 'otherUser',
          message: msg.message || '[Media or special message]',
          date: new Date(msg.date * 1000),
          messageId: msg.id,
        });
      }

      chatMessages.reverse();

      return {
        name: targetUser.username || targetUser.phone || `${targetUser.id}`,
        userId: Number(targetUser.id),
        messages: chatMessages,
      };
    } catch (error: any) {
      logger.error({ error: error.message }, 'Error searching chats');
      return null;
    }
  }


  private getFileName(document: Api.Document): string | undefined {
    for (const attr of document.attributes) {
      if (attr instanceof Api.DocumentAttributeFilename) {
        return attr.fileName;
      }
    }
    return undefined;
  }

  private hasData(result: SearchResult): boolean {
    const { data } = result;
    return !!(
      (data.images && data.images.length > 0) ||
      (data.videos && data.videos.length > 0) ||
      (data.audios && data.audios.length > 0) ||
      (data.chats && data.chats.length > 0)
    );
  }

  private async getAllActiveUserIds(): Promise<number[]> {
    const { getAllActiveUserIds } = await import('../userbot/runUserBot');
    return getAllActiveUserIds();
  }

  async downloadMedia(
    userId: number,
    targetId: number,
    messageId: number
  ): Promise<Buffer | null> {
    const client = getActiveClient(userId);
    if (!client) {
      logger.warn({ userId }, 'Client not active');
      return null;
    }

    try {
      const messages = await client.getMessages(targetId, { ids: [messageId] });
      const message = messages[0];

      if (!message || !message.media) {
        logger.warn({ messageId }, 'Message or media not found');
        return null;
      }

      const buffer = await client.downloadMedia(message);
      return buffer as Buffer;
    } catch (error: any) {
      logger.error({ error: error.message, messageId }, 'Error downloading media');
      return null;
    }
  }
}

export const advancedSearchService = new AdvancedSearchService();
