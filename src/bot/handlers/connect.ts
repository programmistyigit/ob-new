import { Context } from 'telegraf';
import { BotUser } from '../../mongodb/bot.user.schema';
import { createLogger } from '../../utils/logger';
import { contactKeyboard, numericKeyboard } from '../keyboards';
import { t } from '../i18n';
import { getLoginResolver } from '../../connect';

const logger = createLogger('ConnectHandler');

export const handleConnect = async (ctx: Context) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  try {
    const user = await BotUser.findOne({ userId });
    const lang = user?.settings.language || 'uz';

    if (!user) {
      await ctx.reply('Please use /start first');
      return;
    }

    const hasActiveSubscription = user.expiresAt && new Date(user.expiresAt) > new Date();
    
    if (!hasActiveSubscription) {
      const message = lang === 'uz'
        ? '⚠️ Obuna muddati tugagan yoki faol emas. Iltimos, /start buyrug\'ini ishlating.'
        : lang === 'en'
        ? '⚠️ Your subscription has expired or is not active. Please use /start command.'
        : '⚠️ Ваша подписка истекла или неактивна. Пожалуйста, используйте команду /start.';
      
      await ctx.reply(message);
      logger.info({ userId, expiresAt: user.expiresAt }, 'Subscription expired or not active');
      return;
    }

    await BotUser.findOneAndUpdate(
      { userId },
      { action: 'awaiting_code' }
    );

    await ctx.reply(t(lang, 'connect_prompt'), contactKeyboard(lang));
    
    logger.info({ userId }, 'Connect initiated');
  } catch (error) {
    logger.error({ error, userId }, 'Error in connect handler');
    await ctx.reply('Error. Please try again.');
  }
};

export const handleContact = async (ctx: Context) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const contact = (ctx.message as any)?.contact;
  if (!contact) return;

  try {
    const user = await BotUser.findOne({ userId });
    const lang = user?.settings.language || 'uz';

    const phoneNumber = contact.phone_number;
    logger.info({ userId, phone: phoneNumber.slice(0, 4) + '***' }, 'Contact received');

    const isShareActivation = user?.action === 'awaiting_share_contact';

    await BotUser.findOneAndUpdate(
      { userId },
      { 
        action: 'awaiting_code',
        pendingShareActivation: isShareActivation
      }
    );

    if (isShareActivation) {
      logger.info({ userId }, 'Share activation pending - will activate after successful login');
    }

    const resolver = getLoginResolver(userId, phoneNumber);
    if (resolver) {
      resolver.resolvePhoneNumber(phoneNumber);
    }

    await ctx.reply(`${t(lang, 'code_prompt')}\n\n${t(lang, 'code_label')} _____`, numericKeyboard());
    
    logger.info({ userId, isShareActivation }, 'Code input mode activated');
  } catch (error) {
    logger.error({ error, userId }, 'Error handling contact');
    await ctx.reply('Error. Please try again.');
  }
};
