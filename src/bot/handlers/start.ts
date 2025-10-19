import { Context } from 'telegraf';
import { BotUser } from '../../mongodb/bot.user.schema';
import { createLogger } from '../../utils/logger';
import { startKeyboard } from '../keyboards';
import { t } from '../i18n';
import { env } from '../../config/env';

const logger = createLogger('StartHandler');

export const handleStart = async (ctx: Context) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  try {
    let user = await BotUser.findOne({ userId });
    
    if (!user) {
      const trialExpiresAt = new Date(Date.now() + env.TRIAL_DAYS * 24 * 60 * 60 * 1000);
      
      user = await BotUser.create({
        userId,
        status: 'active',
        action: 'guest',
        pay: 'none',
        trialUsed: true,
        trialStartedAt: new Date(),
        expiresAt: trialExpiresAt,
        settings: {
          language: 'uz',
        },
      });
      logger.info({ userId, trialDays: env.TRIAL_DAYS, expiresAt: trialExpiresAt }, 'New user created with trial');
      
      const lang = user.settings.language || 'uz';
      const trialMessage = lang === 'uz'
        ? `🎉 Xush kelibsiz OblivionLog'ga!\n\n✨ Sizga ${env.TRIAL_DAYS} kunlik BEPUL sinov davri berildi!\n\n📅 Trial muddati: ${trialExpiresAt.toLocaleDateString()}\n\n🚀 Boshlash uchun:\n/connect - Akkauntni ulash\n/settings - Sozlamalar`
        : lang === 'en'
        ? `🎉 Welcome to OblivionLog!\n\n✨ You have received a ${env.TRIAL_DAYS}-day FREE trial!\n\n📅 Trial expires: ${trialExpiresAt.toLocaleDateString()}\n\n🚀 Get started:\n/connect - Connect account\n/settings - Settings`
        : `🎉 Добро пожаловать в OblivionLog!\n\n✨ Вам предоставлен ${env.TRIAL_DAYS}-дневный БЕСПЛАТНЫЙ пробный период!\n\n📅 Пробный период истекает: ${trialExpiresAt.toLocaleDateString()}\n\n🚀 Начать:\n/connect - Подключить аккаунт\n/settings - Настройки`;
      
      await ctx.reply(trialMessage);
      return;
    }

    const lang = user.settings.language || 'uz';
    
    const hasActiveSubscription = user.expiresAt && new Date(user.expiresAt) > new Date();
    
    if (hasActiveSubscription) {
      const expiryDate = new Date(user.expiresAt!).toLocaleDateString();
      const isTrialActive = user.trialUsed && user.pay === 'none';
      
      const message = lang === 'uz'
        ? `✅ ${isTrialActive ? 'Trial davri faol!' : 'Faol obuna!'}\n📅 Amal qilish muddati: ${expiryDate}\n\n🔗 /connect - Akkauntni ulash\n⚙️ /settings - Sozlamalar`
        : lang === 'en'
        ? `✅ ${isTrialActive ? 'Trial period active!' : 'Active subscription!'}\n📅 Valid until: ${expiryDate}\n\n🔗 /connect - Connect account\n⚙️ /settings - Settings`
        : `✅ ${isTrialActive ? 'Пробный период активен!' : 'Активная подписка!'}\n📅 Действительна до: ${expiryDate}\n\n🔗 /connect - Подключить аккаунт\n⚙️ /settings - Настройки`;
      
      await ctx.reply(message);
      logger.info({ userId, expiresAt: user.expiresAt, isTrial: isTrialActive }, 'User has active subscription');
    } else {
      const trialExpiredMessage = user.trialUsed 
        ? (lang === 'uz'
          ? `⏰ Trial muddatingiz tugadi!\n\n💎 Xizmatdan foydalanishni davom ettirish uchun obuna bo'ling:`
          : lang === 'en'
          ? `⏰ Your trial period has expired!\n\n💎 Subscribe to continue using the service:`
          : `⏰ Ваш пробный период истёк!\n\n💎 Подпишитесь, чтобы продолжить:`)
        : t(lang, 'welcome');
      
      await ctx.reply(trialExpiredMessage, startKeyboard(lang));
      logger.info({ userId, trialExpired: user.trialUsed }, 'Payment options shown');
    }
    
    logger.info({ userId }, 'Start command handled');
  } catch (error) {
    logger.error({ error, userId }, 'Error in start handler');
    await ctx.reply('An error occurred. Please try again.');
  }
};
