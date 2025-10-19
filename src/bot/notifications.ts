import { Telegraf } from 'telegraf';
import { env } from '../config/env';
import { BotUser } from '../mongodb/bot.user.schema';
import { t } from './i18n';
import { createLogger } from '../utils/logger';

const logger = createLogger('Notifications');
const bot = new Telegraf(env.BOT_TOKEN);

export const send2FANotification = async (userId: number, hint?: string) => {
  try {
    const user = await BotUser.findOne({ userId });
    const lang = user?.settings.language || 'uz';
    
    let message = t(lang, '2fa_required');
    if (hint) {
      message += `\n\n💡 Hint: ${hint}`;
    }
    
    await bot.telegram.sendMessage(userId, message);
    logger.info({ userId, hint }, '2FA notification sent');
  } catch (error) {
    logger.error({ error, userId }, 'Failed to send 2FA notification');
  }
};

export const sendLoginSuccessNotification = async (userId: number) => {
  try {
    const user = await BotUser.findOne({ userId });
    const lang = user?.settings.language || 'uz';
    
    await bot.telegram.sendMessage(
      userId,
      `${t(lang, 'login_success')}\n\n⚙️ ${t(lang, 'settings_info')}`
    );
    logger.info({ userId }, 'Login success notification sent');
  } catch (error) {
    logger.error({ error, userId }, 'Failed to send login success notification');
  }
};
