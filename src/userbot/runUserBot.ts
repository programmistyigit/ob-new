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

  try {
    await client.connect();
    
    await client.getMe();
    
    await BotUser.findOneAndUpdate(
      { userId },
      { sessionStatus: 'connected' }
    );
    
    setupArchiveHandler(client, userId);
    
    await monitorSession(client, userId, handleSessionEnd);
    
    activeClients.set(userId, client);
    
    logger.info({ userId }, 'Userbot started successfully');
    
    return client;
  } catch (error: any) {
    const errorMsg = error.errorMessage || error.message || '';
    
    if (errorMsg.includes('AUTH_KEY_UNREGISTERED') || 
        errorMsg.includes('SESSION_REVOKED') || 
        errorMsg.includes('USER_DEACTIVATED') ||
        errorMsg.includes('AUTH_KEY_DUPLICATED')) {
      logger.error({ userId, error: errorMsg }, 'Invalid session detected on startup');
      await handleSessionEnd(userId, errorMsg);
    }
    
    throw error;
  }
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
  
  const user = await BotUser.findOne({ userId });
  const lang = user?.settings.language || 'uz';
  
  await BotUser.findOneAndUpdate(
    { userId },
    {
      status: 'disabled',
      sessionStatus: 'revoked',
      action: 'guest',
    }
  );
  
  const { getBot } = await import('../bot');
  const bot = getBot();
  if (bot) {
    const message = lang === 'uz'
      ? '⚠️ DIQQAT: Telegram sozlamalaringizdan OblivionLog seansini o\'chirib yubordingiz!\n\n' +
        '❌ Barcha xizmatlar to\'xtatildi\n' +
        '❌ Arxivlash faol emas\n' +
        '❌ Ota-ona nazorati o\'chirildi\n\n' +
        '✅ Qayta ulanish uchun: /connect buyrug\'ini ishlating\n' +
        '📌 /start - Asosiy menyu'
      : lang === 'en'
      ? '⚠️ WARNING: You have terminated the OblivionLog session from your Telegram settings!\n\n' +
        '❌ All services stopped\n' +
        '❌ Archiving disabled\n' +
        '❌ Parental control disabled\n\n' +
        '✅ To reconnect: use /connect command\n' +
        '📌 /start - Main menu'
      : '⚠️ ВНИМАНИЕ: Вы удалили сеанс OblivionLog из настроек Telegram!\n\n' +
        '❌ Все сервисы остановлены\n' +
        '❌ Архивация отключена\n' +
        '❌ Родительский контроль отключён\n\n' +
        '✅ Для переподключения: используйте команду /connect\n' +
        '📌 /start - Главное меню';
    
    try {
      await bot.telegram.sendMessage(userId, message);
      logger.info({ userId, reason }, 'Session revocation notification sent');
    } catch (error: any) {
      logger.error({ userId, error: error.message }, 'Failed to send session revocation notification');
    }
  }
  
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
