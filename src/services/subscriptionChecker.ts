import { BotUser } from '../mongodb/bot.user.schema';
import { createLogger } from '../utils/logger';

const logger = createLogger('SubscriptionChecker');

export const checkExpiredSubscriptions = async (): Promise<void> => {
  try {
    const now = new Date();
    
    const expiredUsers = await BotUser.find({
      status: 'active',
      expiresAt: { $lte: now }
    });

    logger.info({ count: expiredUsers.length }, 'Checking for expired subscriptions');

    if (expiredUsers.length === 0) {
      return;
    }

    for (const user of expiredUsers) {
      try {
        logger.warn({ 
          userId: user.userId, 
          expiresAt: user.expiresAt,
          pay: user.pay 
        }, 'Subscription expired - disabling services only (userbot stays connected)');

        await BotUser.findOneAndUpdate(
          { userId: user.userId },
          {
            status: 'disabled',
            action: 'guest'
          }
        );

        const { getBot } = await import('../bot');
        const bot = getBot();
        if (bot) {
          const lang = user.settings.language || 'uz';
          const expiredMessage = lang === 'uz'
            ? '⏰ Obuna muddatingiz tugadi!\n\n💎 Xizmatdan foydalanishni davom ettirish uchun /start buyrug\'ini ishlating va yangi obuna sotib oling.'
            : lang === 'en'
            ? '⏰ Your subscription has expired!\n\n💎 To continue using the service, use /start command and purchase a new subscription.'
            : '⏰ Ваша подписка истекла!\n\n💎 Чтобы продолжить использование, используйте команду /start и приобретите новую подписку.';

          await bot.telegram.sendMessage(user.userId, expiredMessage);
          logger.info({ userId: user.userId }, 'Expiration notification sent');
        }
      } catch (error: any) {
        logger.error({ 
          userId: user.userId, 
          error: error.message 
        }, 'Failed to disable expired user');
      }
    }

    logger.info({ 
      total: expiredUsers.length,
      disabled: expiredUsers.length 
    }, 'Expired subscriptions processed');
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error checking expired subscriptions');
  }
};

export const startSubscriptionChecker = (): void => {
  const CHECK_INTERVAL_MS = 60 * 60 * 1000;
  
  logger.info({ intervalMinutes: 60 }, 'Subscription checker started');
  
  checkExpiredSubscriptions();
  
  setInterval(() => {
    checkExpiredSubscriptions();
  }, CHECK_INTERVAL_MS);
};
