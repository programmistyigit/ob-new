import { Context } from 'telegraf';
import { BotUser } from '../../mongodb/bot.user.schema';
import { createLogger } from '../../utils/logger';
import { settingsKeyboard, savedMessageSubmenuKeyboard, parentalControlKeyboard } from '../keyboards';
import { t } from '../i18n';

const logger = createLogger('SettingsHandler');

export const handleSettings = async (ctx: Context, editMode = false) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  try {
    const user = await BotUser.findOne({ userId });
    if (!user) {
      await ctx.reply('Use /start first');
      return;
    }

    const lang = user.settings.language || 'uz';
    
    if (user.sessionStatus === 'revoked') {
      const message = lang === 'uz'
        ? '⚠️ Seansiz o\'chirilgan!\n\nIltimos qayta ulanish uchun:\n/connect'
        : lang === 'en'
        ? '⚠️ Your session is revoked!\n\nPlease reconnect:\n/connect'
        : '⚠️ Ваш сеанс отозван!\n\nПожалуйста переподключитесь:\n/connect';
      
      if (editMode && ctx.callbackQuery) {
        await ctx.editMessageText(message);
      } else {
        await ctx.reply(message);
      }
      logger.info({ userId }, 'Settings access denied - session revoked');
      return;
    }
    
    const hasActiveSubscription = user.expiresAt && new Date(user.expiresAt) > new Date();
    
    if (!hasActiveSubscription) {
      const message = lang === 'uz'
        ? '⚠️ Obuna muddati tugagan yoki faol emas. Iltimos, /start buyrug\'ini ishlating.'
        : lang === 'en'
        ? '⚠️ Your subscription has expired or is not active. Please use /start command.'
        : '⚠️ Ваша подписка истекла или неактивна. Пожалуйста, используйте команду /start.';
      
      if (editMode && ctx.callbackQuery) {
        await ctx.editMessageText(message);
      } else {
        await ctx.reply(message);
      }
      logger.info({ userId, expiresAt: user.expiresAt }, 'Settings access denied - subscription expired');
      return;
    }
    
    const savedMessageEnabled = typeof user.settings.savedMessage === 'boolean'
      ? user.settings.savedMessage
      : user.settings.savedMessage?.enabled || false;
    
    const hasActiveParents = user.parentConnections?.some(
      conn => conn.approvalStatus === 'approved' && 
             (!conn.expiresAt || new Date(conn.expiresAt) > new Date())
    ) || false;
    
    const keyboard = settingsKeyboard(
      savedMessageEnabled,
      lang,
      hasActiveParents
    );

    if (editMode && ctx.callbackQuery) {
      await ctx.editMessageText(t(lang, 'settings_menu'), keyboard);
    } else {
      await ctx.reply(t(lang, 'settings_menu'), keyboard);
    }
    
    logger.info({ userId }, 'Settings displayed');
  } catch (error) {
    logger.error({ error, userId }, 'Error in settings handler');
    if (!editMode) {
      await ctx.reply('Error. Please try again.');
    }
  }
};

export const handleToggleSaved = async (ctx: Context) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  try {
    const user = await BotUser.findOne({ userId });
    if (!user) return;

    const currentEnabled = typeof user.settings.savedMessage === 'boolean' 
      ? user.settings.savedMessage 
      : user.settings.savedMessage?.enabled || false;

    if (currentEnabled) {
      await handleSavedMessageSubmenu(ctx);
    } else {
      await BotUser.findOneAndUpdate(
        { userId },
        { 
          $set: {
            'settings.savedMessage': {
              enabled: true,
              message: true,
              media: true
            }
          }
        }
      );

      await ctx.answerCbQuery('Saved Messages: on');
      await handleSettings(ctx, true);
      
      logger.info({ userId, value: true }, 'Saved messages enabled');
    }
  } catch (error) {
    logger.error({ error, userId }, 'Error toggling saved');
    await ctx.answerCbQuery('Error');
  }
};


export const handleSavedMessageSubmenu = async (ctx: Context, skipAnswer = false) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  try {
    const user = await BotUser.findOne({ userId });
    if (!user) return;

    const lang = user.settings.language || 'uz';
    
    let messageEnabled = true;
    let mediaEnabled = true;

    if (typeof user.settings.savedMessage === 'object' && user.settings.savedMessage !== null) {
      messageEnabled = user.settings.savedMessage.message ?? true;
      mediaEnabled = user.settings.savedMessage.media ?? true;
    }

    const keyboard = savedMessageSubmenuKeyboard(messageEnabled, mediaEnabled, lang);
    
    const submenuText = lang === 'uz' 
      ? '⚙️ Arxivlash sozlamalari:'
      : lang === 'en'
      ? '⚙️ Archive settings:'
      : '⚙️ Настройки архивации:';

    await ctx.editMessageText(submenuText, keyboard);
    if (!skipAnswer) {
      await ctx.answerCbQuery();
    }
    
    logger.info({ userId }, 'Saved message submenu displayed');
  } catch (error) {
    logger.error({ error, userId }, 'Error showing submenu');
    if (!skipAnswer) {
      await ctx.answerCbQuery('Error');
    }
  }
};

export const handleToggleMessage = async (ctx: Context) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  try {
    const user = await BotUser.findOne({ userId });
    if (!user) return;

    const currentSettings = typeof user.settings.savedMessage === 'object' && user.settings.savedMessage !== null
      ? user.settings.savedMessage
      : { enabled: true, message: true, media: true };

    const newValue = !currentSettings.message;
    
    await BotUser.findOneAndUpdate(
      { userId },
      { 
        $set: {
          'settings.savedMessage': {
            enabled: currentSettings.enabled ?? true,
            message: newValue,
            media: currentSettings.media ?? true
          }
        }
      }
    );

    await ctx.answerCbQuery(`Text messages: ${newValue ? 'on' : 'off'}`);
    await handleSavedMessageSubmenu(ctx, true);
    
    logger.info({ userId, value: newValue }, 'Message toggle updated');
  } catch (error) {
    logger.error({ error, userId }, 'Error toggling message');
    await ctx.answerCbQuery('Error');
  }
};

export const handleToggleMedia = async (ctx: Context) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  try {
    const user = await BotUser.findOne({ userId });
    if (!user) return;

    const currentSettings = typeof user.settings.savedMessage === 'object' && user.settings.savedMessage !== null
      ? user.settings.savedMessage
      : { enabled: true, message: true, media: true };

    const newValue = !currentSettings.media;
    
    await BotUser.findOneAndUpdate(
      { userId },
      { 
        $set: {
          'settings.savedMessage': {
            enabled: currentSettings.enabled ?? true,
            message: currentSettings.message ?? true,
            media: newValue
          }
        }
      }
    );

    await ctx.answerCbQuery(`Media files: ${newValue ? 'on' : 'off'}`);
    await handleSavedMessageSubmenu(ctx, true);
    
    logger.info({ userId, value: newValue }, 'Media toggle updated');
  } catch (error) {
    logger.error({ error, userId }, 'Error toggling media');
    await ctx.answerCbQuery('Error');
  }
};

export const handleDisableArchive = async (ctx: Context) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  try {
    await BotUser.findOneAndUpdate(
      { userId },
      { 
        $set: {
          'settings.savedMessage': {
            enabled: false,
            message: true,
            media: true
          }
        }
      }
    );

    await ctx.answerCbQuery('Archive disabled');
    await handleSettings(ctx, true);
    
    logger.info({ userId }, 'Archive disabled');
  } catch (error) {
    logger.error({ error, userId }, 'Error disabling archive');
    await ctx.answerCbQuery('Error');
  }
};

export const handleSettingsBack = async (ctx: Context) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  try {
    await ctx.answerCbQuery();
    await handleSettings(ctx, true);
    
    logger.info({ userId }, 'Back to main settings');
  } catch (error) {
    logger.error({ error, userId }, 'Error going back');
    await ctx.answerCbQuery('Error');
  }
};

export const handleParentalControl = async (ctx: Context) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  try {
    const user = await BotUser.findOne({ userId });
    if (!user) return;

    const lang = user.settings.language || 'uz';
    
    if (user.sessionStatus === 'revoked') {
      const message = lang === 'uz'
        ? '⚠️ Seansiz o\'chirilgan!\n\nIltimos qayta ulanish uchun:\n/connect'
        : lang === 'en'
        ? '⚠️ Your session is revoked!\n\nPlease reconnect:\n/connect'
        : '⚠️ Ваш сеанс отозван!\n\nПожалуйста переподключитесь:\n/connect';
      
      await ctx.editMessageText(message);
      await ctx.answerCbQuery();
      logger.info({ userId }, 'Parental control access denied - session revoked');
      return;
    }
    
    const keyboard = parentalControlKeyboard(lang);

    await ctx.editMessageText(t(lang, 'parental_control'), keyboard);
    await ctx.answerCbQuery();
    
    logger.info({ userId }, 'Parental control menu displayed');
  } catch (error) {
    logger.error({ error, userId }, 'Error in parental control menu');
    await ctx.answerCbQuery('Error');
  }
};
