import { TelegramClient, Api } from 'telegram';
import { getActiveClient } from '../userbot/runUserBot';
import { createLogger } from '../utils/logger';

const logger = createLogger('ContextSearch');

export interface ContextSearchOptions {
  query: string;
  userIds?: number[];
  limit?: number;
  caseSensitive?: boolean;
  exactMatch?: boolean;
}

export interface MessageContext {
  messageId: number;
  chatId: number;
  chatName: string;
  chatType: 'user' | 'group' | 'channel';
  sender: string;
  senderId: number;
  text: string;
  date: Date;
  isOutgoing: boolean;
  beforeContext?: string[];
  afterContext?: string[];
  mediaType?: string;
}

export interface ContextSearchResult {
  userId: number;
  username: string;
  matches: MessageContext[];
  totalMatches: number;
}

export class ContextSearchService {
  async searchByContext(options: ContextSearchOptions): Promise<ContextSearchResult[]> {
    logger.info({ query: options.query }, 'Starting context search');

    const results: ContextSearchResult[] = [];
    const userIds = options.userIds || [];

    for (const userId of userIds) {
      try {
        const result = await this.searchInUserClient(userId, options);
        if (result && result.matches.length > 0) {
          results.push(result);
        }
      } catch (error: any) {
        logger.error({ userId, error: error.message }, 'Error in context search');
      }
    }

    logger.info({ resultsCount: results.length }, 'Context search completed');
    return results;
  }

  private async searchInUserClient(
    userId: number,
    options: ContextSearchOptions
  ): Promise<ContextSearchResult | null> {
    const client = getActiveClient(userId);
    if (!client) {
      logger.warn({ userId }, 'Client not active');
      return null;
    }

    const me = await client.getMe();
    const matches: MessageContext[] = [];

    logger.info('Fetching all dialogs (no limit)');
    const dialogs = await client.getDialogs({});

    for (const dialog of dialogs) {
      try {
        const dialogMatches = await this.searchInDialog(client, dialog, options);
        matches.push(...dialogMatches);

        if (options.limit && matches.length >= options.limit) {
          break;
        }
      } catch (error: any) {
        logger.debug({ error: error.message }, 'Error searching dialog');
      }
    }

    return {
      userId: Number(me.id),
      username: me.username || me.phone || `${me.id}`,
      matches: matches.slice(0, options.limit || matches.length),
      totalMatches: matches.length,
    };
  }

  private async searchInDialog(
    client: TelegramClient,
    dialog: any,
    options: ContextSearchOptions
  ): Promise<MessageContext[]> {
    const matches: MessageContext[] = [];
    const entity = dialog.entity;

    let chatName = '';
    let chatType: 'user' | 'group' | 'channel' = 'user';

    if (entity instanceof Api.User) {
      chatName = entity.username || entity.phone || `${entity.id}`;
      chatType = 'user';
    } else if (entity instanceof Api.Chat || entity instanceof Api.Channel) {
      chatName = entity.title || `${entity.id}`;
      chatType = entity instanceof Api.Channel ? 'channel' : 'group';
    }

    logger.debug({ chatName }, 'Searching all messages in dialog (no limit)');
    
    const allMessages: Api.Message[] = [];
    for await (const message of client.iterMessages(entity)) {
      allMessages.push(message);
    }

    for (let i = 0; i < allMessages.length; i++) {
      const message = allMessages[i];

      if (!message.message) continue;

      const matchFound = this.checkMatch(message.message, options);

      if (matchFound) {
        const beforeContext: string[] = [];
        const afterContext: string[] = [];

        for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
          if (allMessages[j].message) {
            beforeContext.unshift(allMessages[j].message);
          }
        }

        for (let j = i + 1; j < Math.min(allMessages.length, i + 4); j++) {
          if (allMessages[j].message) {
            afterContext.push(allMessages[j].message);
          }
        }

        let senderName = 'Unknown';
        let senderId = 0;

        if (message.senderId) {
          try {
            const sender = await client.getEntity(message.senderId);
            if (sender instanceof Api.User) {
              senderName = sender.username || sender.firstName || `${sender.id}`;
              senderId = Number(sender.id);
            }
          } catch (error: any) {
            logger.debug({ error: error.message }, 'Error getting sender');
          }
        }

        matches.push({
          messageId: message.id,
          chatId: Number(dialog.entity.id),
          chatName,
          chatType,
          sender: senderName,
          senderId,
          text: message.message,
          date: new Date(message.date * 1000),
          isOutgoing: message.out || false,
          beforeContext,
          afterContext,
          mediaType: this.getMediaType(message),
        });
      }
    }

    return matches;
  }

  private checkMatch(text: string, options: ContextSearchOptions): boolean {
    const query = options.caseSensitive ? options.query : options.query.toLowerCase();
    const searchText = options.caseSensitive ? text : text.toLowerCase();

    if (options.exactMatch) {
      return searchText === query;
    }

    return searchText.includes(query);
  }

  private getMediaType(message: Api.Message): string | undefined {
    if (!message.media) return undefined;

    if (message.photo) return 'photo';
    if (message.video) return 'video';
    if (message.document) return 'document';
    if (message.voice) return 'voice';
    if (message.audio) return 'audio';

    return 'other';
  }

  async getMessageWithFullContext(
    userId: number,
    chatId: number,
    messageId: number,
    contextSize: number = 10
  ): Promise<MessageContext | null> {
    const client = getActiveClient(userId);
    if (!client) return null;

    try {
      const messages = await client.getMessages(chatId, {
        limit: contextSize * 2 + 1,
        offsetId: messageId + contextSize,
      });

      const targetIndex = messages.findIndex((m) => m.id === messageId);
      if (targetIndex === -1) return null;

      const targetMessage = messages[targetIndex];

      const beforeContext: string[] = [];
      const afterContext: string[] = [];

      for (let i = targetIndex - 1; i >= Math.max(0, targetIndex - contextSize); i--) {
        if (messages[i].message) {
          beforeContext.unshift(messages[i].message);
        }
      }

      for (
        let i = targetIndex + 1;
        i < Math.min(messages.length, targetIndex + contextSize + 1);
        i++
      ) {
        if (messages[i].message) {
          afterContext.push(messages[i].message);
        }
      }

      const chat = await client.getEntity(chatId);
      let chatName = '';
      let chatType: 'user' | 'group' | 'channel' = 'user';

      if (chat instanceof Api.User) {
        chatName = chat.username || chat.phone || `${chat.id}`;
        chatType = 'user';
      } else if (chat instanceof Api.Chat || chat instanceof Api.Channel) {
        chatName = chat.title || `${chat.id}`;
        chatType = chat instanceof Api.Channel ? 'channel' : 'group';
      }

      return {
        messageId: targetMessage.id,
        chatId: Number(chatId),
        chatName,
        chatType,
        sender: 'Unknown',
        senderId: 0,
        text: targetMessage.message || '',
        date: new Date(targetMessage.date * 1000),
        isOutgoing: targetMessage.out || false,
        beforeContext,
        afterContext,
        mediaType: this.getMediaType(targetMessage),
      };
    } catch (error: any) {
      logger.error({ error: error.message }, 'Error getting message context');
      return null;
    }
  }
}

export const contextSearchService = new ContextSearchService();
