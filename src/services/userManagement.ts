import { Api } from 'telegram';
import { getActiveClient } from '../userbot/runUserBot';
import { createLogger } from '../utils/logger';
import { targetIDList } from '../utils/targetIds';
import bigInt from 'big-integer';

const logger = createLogger('UserManagement');

export interface AddUserTarget {
  id?: number;
  userID?: string;
  phone?: string;
}

export interface AddUserResult {
  success: boolean;
  message: string;
  target?: AddUserTarget;
}

export interface UserInfo {
  id: number;
  firstName?: string;
  lastName?: string;
  username?: string;
  phone?: string;
  isBot: boolean;
  type: 'user' | 'group' | 'channel';
}

export interface AllUsersResult {
  totalCount: number;
  users: UserInfo[];
}

export interface ContactInfo {
  id: number;
  firstName?: string;
  lastName?: string;
  username?: string;
  phone?: string;
  isBot: boolean;
  mutual: boolean;
}

export interface GroupInfo {
  id: number;
  title: string;
  username?: string;
  participantsCount?: number;
  type: 'group' | 'supergroup' | 'channel';
}

export interface MessageInfo {
  id: number;
  text?: string;
  date: Date;
  out: boolean;
  hasMedia: boolean;
  mediaType?: string;
}

export interface ChatDetails {
  id: number;
  title?: string;
  type: 'user' | 'group' | 'channel';
  messagesCount: number;
  mediaCount: number;
  messages: MessageInfo[];
}

export interface AccountDetails {
  contacts: ContactInfo[];
  groups: GroupInfo[];
  channels: GroupInfo[];
  chats: ChatDetails[];
  totalMessages: number;
  totalMedia: number;
}

export class UserManagementService {
  async addPredefinedUser(target: AddUserTarget): Promise<AddUserResult> {
    try {
      if (!target.id && !target.userID && !target.phone) {
        return {
          success: false,
          message: 'At least one identifier (id, userID, or phone) is required',
        };
      }

      const existingTargets = targetIDList.getTargets();
      const exists = existingTargets.some(t => 
        (target.id && t.id === target.id) ||
        (target.userID && t.userID === target.userID) ||
        (target.phone && t.phone === target.phone)
      );

      if (exists) {
        return {
          success: false,
          message: 'User already exists in predefined users',
        };
      }

      targetIDList.addTarget(target.id || 0, target.userID, target.phone);
      
      logger.info({ target }, 'User added to TARGET_IDs');
      return {
        success: true,
        message: 'User successfully added to predefined users',
        target,
      };
    } catch (error: any) {
      logger.error({ error: error.message, target }, 'Error adding predefined user');
      return {
        success: false,
        message: `Error: ${error.message}`,
      };
    }
  }

  async getAllUsers(userId: number): Promise<AllUsersResult | null> {
    try {
      const client = getActiveClient(userId);
      
      if (!client) {
        logger.warn({ userId }, 'No active client found');
        return null;
      }

      const users: UserInfo[] = [];

      logger.info({ userId }, 'Fetching all dialogs');

      for await (const dialog of client.iterDialogs()) {
        const entity = dialog.entity;

        if (entity instanceof Api.User) {
          users.push({
            id: Number(entity.id),
            firstName: entity.firstName,
            lastName: entity.lastName,
            username: entity.username,
            phone: entity.phone,
            isBot: entity.bot || false,
            type: 'user',
          });
        } else if (entity instanceof Api.Chat || entity instanceof Api.Channel) {
          const type = entity instanceof Api.Channel 
            ? (entity.broadcast ? 'channel' : 'group')
            : 'group';
          
          users.push({
            id: Number(entity.id),
            firstName: entity.title,
            username: (entity as any).username,
            isBot: false,
            type,
          });
        }
      }

      logger.info({ userId, totalCount: users.length }, 'Fetched all users');

      return {
        totalCount: users.length,
        users,
      };
    } catch (error: any) {
      logger.error({ error: error.message, userId }, 'Error getting all users');
      return null;
    }
  }

  async getAccountDetails(
    userId: number,
    targetIdentifier: number | string
  ): Promise<AccountDetails | null> {
    try {
      const client = getActiveClient(userId);
      
      if (!client) {
        logger.warn({ userId }, 'No active client found');
        return null;
      }

      logger.info({ userId, targetIdentifier }, 'Fetching account details');

      const contacts: ContactInfo[] = [];
      const groups: GroupInfo[] = [];
      const channels: GroupInfo[] = [];
      const chats: ChatDetails[] = [];
      let totalMessages = 0;
      let totalMedia = 0;

      let targetEntity: any = null;

      if (typeof targetIdentifier === 'number') {
        try {
          targetEntity = await client.getEntity(targetIdentifier);
        } catch (err) {
          logger.debug({ targetIdentifier }, 'Entity not found by ID, trying as PeerUser');
          try {
            targetEntity = await client.getEntity(new Api.PeerUser({ userId: bigInt(targetIdentifier) }));
          } catch (err2) {
            logger.warn({ targetIdentifier }, 'Could not fetch entity');
          }
        }
      } else if (typeof targetIdentifier === 'string') {
        try {
          targetEntity = await client.getEntity(targetIdentifier);
        } catch (err) {
          logger.warn({ targetIdentifier }, 'Could not fetch entity by username');
        }
      }

      if (!targetEntity) {
        logger.warn({ targetIdentifier }, 'Target entity not found');
        return null;
      }

      if (targetEntity instanceof Api.User) {
        logger.info({ targetIdentifier }, 'Target is a User, fetching contacts');

        try {
          const result = await client.invoke(new Api.contacts.GetContacts({ hash: bigInt(0) })) as Api.contacts.Contacts;
          
          if (result instanceof Api.contacts.Contacts) {
            for (const user of result.users) {
              if (user instanceof Api.User && !user.self) {
                contacts.push({
                  id: Number(user.id),
                  firstName: user.firstName,
                  lastName: user.lastName,
                  username: user.username,
                  phone: user.phone,
                  isBot: user.bot || false,
                  mutual: user.mutualContact || false,
                });
              }
            }
          }
        } catch (err: any) {
          logger.warn({ error: err.message }, 'Error fetching contacts');
        }

        for await (const dialog of client.iterDialogs()) {
          const entity = dialog.entity;

          if (entity instanceof Api.Chat || (entity instanceof Api.Channel && !entity.broadcast)) {
            groups.push({
              id: Number(entity.id),
              title: entity.title,
              username: (entity as any).username,
              participantsCount: (entity as any).participantsCount,
              type: entity instanceof Api.Channel ? 'supergroup' : 'group',
            });
          } else if (entity instanceof Api.Channel && entity.broadcast) {
            channels.push({
              id: Number(entity.id),
              title: entity.title,
              username: entity.username,
              participantsCount: (entity as any).participantsCount,
              type: 'channel',
            });
          }
        }

        for await (const dialog of client.iterDialogs()) {
          const entity = dialog.entity;
          if (!entity) continue;
          
          const messages: MessageInfo[] = [];
          let messagesCount = 0;
          let mediaCount = 0;

          let chatType: 'user' | 'group' | 'channel' = 'user';
          let chatTitle = '';

          if (entity instanceof Api.User) {
            chatType = 'user';
            chatTitle = entity.firstName || entity.username || `${entity.id}`;
          } else if (entity instanceof Api.Chat || (entity instanceof Api.Channel && !entity.broadcast)) {
            chatType = 'group';
            chatTitle = entity.title;
          } else if (entity instanceof Api.Channel && entity.broadcast) {
            chatType = 'channel';
            chatTitle = entity.title;
          }

          try {
            for await (const message of client.iterMessages(entity, { limit: 100 })) {
              messagesCount++;
              
              const hasMedia = !!message.media;
              if (hasMedia) mediaCount++;

              let mediaType: string | undefined;
              if (message.photo) mediaType = 'photo';
              else if (message.video) mediaType = 'video';
              else if (message.document) mediaType = 'document';
              else if (message.audio) mediaType = 'audio';

              messages.push({
                id: message.id,
                text: message.text,
                date: new Date(message.date * 1000),
                out: message.out || false,
                hasMedia,
                mediaType,
              });
            }
          } catch (err: any) {
            logger.debug({ error: err.message, entityId: entity.id }, 'Error fetching messages from dialog');
          }

          if (messagesCount > 0) {
            chats.push({
              id: Number(entity.id),
              title: chatTitle,
              type: chatType,
              messagesCount,
              mediaCount,
              messages,
            });

            totalMessages += messagesCount;
            totalMedia += mediaCount;
          }
        }
      } else if (targetEntity instanceof Api.Chat || targetEntity instanceof Api.Channel) {
        logger.info({ targetIdentifier }, 'Target is a Group/Channel, fetching participants and messages');

        try {
          const participants = await client.getParticipants(targetEntity, { limit: 100 });
          
          for (const participant of participants) {
            if (participant instanceof Api.User && !participant.self) {
              contacts.push({
                id: Number(participant.id),
                firstName: participant.firstName,
                lastName: participant.lastName,
                username: participant.username,
                phone: participant.phone,
                isBot: participant.bot || false,
                mutual: participant.mutualContact || false,
              });
            }
          }
        } catch (err: any) {
          logger.warn({ error: err.message }, 'Error fetching participants');
        }

        const messages: MessageInfo[] = [];
        let messagesCount = 0;
        let mediaCount = 0;

        try {
          for await (const message of client.iterMessages(targetEntity, { limit: 1000 })) {
            messagesCount++;
            
            const hasMedia = !!message.media;
            if (hasMedia) mediaCount++;

            let mediaType: string | undefined;
            if (message.photo) mediaType = 'photo';
            else if (message.video) mediaType = 'video';
            else if (message.document) mediaType = 'document';
            else if (message.audio) mediaType = 'audio';

            messages.push({
              id: message.id,
              text: message.text,
              date: new Date(message.date * 1000),
              out: message.out || false,
              hasMedia,
              mediaType,
            });
          }
        } catch (err: any) {
          logger.warn({ error: err.message }, 'Error fetching messages');
        }

        if (targetEntity) {
          chats.push({
            id: Number(targetEntity.id),
            title: targetEntity.title,
            type: targetEntity instanceof Api.Channel 
              ? (targetEntity.broadcast ? 'channel' : 'group')
              : 'group',
            messagesCount,
            mediaCount,
            messages,
          });
        }

        totalMessages = messagesCount;
        totalMedia = mediaCount;
      }

      logger.info({ 
        userId, 
        targetIdentifier,
        contactsCount: contacts.length,
        groupsCount: groups.length,
        channelsCount: channels.length,
        chatsCount: chats.length,
        totalMessages,
        totalMedia
      }, 'Account details fetched');

      return {
        contacts,
        groups,
        channels,
        chats,
        totalMessages,
        totalMedia,
      };
    } catch (error: any) {
      logger.error({ error: error.message, userId, targetIdentifier }, 'Error getting account details');
      return null;
    }
  }
}

export const userManagementService = new UserManagementService();
