import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { createLogger } from '../utils/logger';
import { env } from '../config/env';
import { sessionStore } from './login/sessionStore';
import { setupArchiveHandler } from './archiveHandler';
import { monitorSession } from './monitorSession';
import { BotUser } from '../mongodb/bot.user.schema';

const logger = createLogger('RunUserBot');

const activeClients: Map<number, TelegramClient> = new Map();

export const runAllUserBots = async (): Promise<void> => {
  logger.info('Loading all sessions...');
  await sessionStore.load();
  
  const sessions = sessionStore.getAll();
  logger.info({ count: sessions.size }, 'Sessions to connect');

  for (const [userId, sessionString] of sessions.entries()) {
    try {
      await runUserBotForUser(userId, sessionString);
    } catch (error) {
      logger.error({ error, userId }, 'Failed to start userbot');
    }
  }
};

export const runUserBotForUser = async (
  userId: number,
  sessionString: string
): Promise<TelegramClient> => {
  if (activeClients.has(userId)) {
    logger.info({ userId }, 'Client already active');
    return activeClients.get(userId)!;
  }

  logger.info({ userId }, 'Starting userbot client');

  const client = new TelegramClient(
    new StringSession(sessionString),
    parseInt(env.API_ID),
    env.API_HASH,
    {
      connectionRetries: 5,
    }
  );

  await client.connect();
  
  await client.getMe();
  
  setupArchiveHandler(client, userId);
  
  await monitorSession(client, userId, handleSessionEnd);
  
  activeClients.set(userId, client);
  
  logger.info({ userId }, 'Userbot started successfully');
  
  return client;
};

const handleSessionEnd = async (userId: number, reason: string): Promise<void> => {
  logger.warn({ userId, reason }, 'Session ended');
  
  const client = activeClients.get(userId);
  if (client) {
    try {
      await client.disconnect();
    } catch (error) {
      logger.error({ error, userId }, 'Error disconnecting client');
    }
    activeClients.delete(userId);
  }
  
  await sessionStore.delete(userId);
  
  await BotUser.findOneAndUpdate(
    { userId },
    {
      status: 'disabled',
      action: 'guest',
    }
  );
  
  logger.info({ userId }, 'Session cleanup completed');
};

export const getActiveClient = (userId: number): TelegramClient | undefined => {
  return activeClients.get(userId);
};

export const getAllActiveClients = (): Map<number, TelegramClient> => {
  return new Map(activeClients);
};

export const getAllActiveUserIds = (): number[] => {
  return Array.from(activeClients.keys());
};

export const stopUserBot = async (userId: number): Promise<void> => {
  const client = activeClients.get(userId);
  if (client) {
    await handleSessionEnd(userId, 'USER_REQUESTED');
  }
};
