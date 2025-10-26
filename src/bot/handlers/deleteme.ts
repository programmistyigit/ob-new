import { Context } from 'telegraf';
import { BotUser } from '../../mongodb/bot.user.schema';
import { createLogger } from '../../utils/logger';
import { deleteConfirmKeyboard } from '../keyboards';
import { t } from '../i18n';
import { stopUserBot } from '../../userbot';

const logger = createLogger('DeleteHandler');

export const handleDeleteMe = async (ctx: Context) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  try {
    const user = await BotUser.findOne({ userId });
    const lang = user?.settings.language || 'uz';
    
    if (user?.sessionStatus === 'revoked') {
      const message = lang === 'uz'
        ? '⚠️ Seansiz o\'chirilgan!\n\nIltimos qayta ulanish uchun:\n/connect'
        : lang === 'en'
        ? '⚠️ Your session is revoked!\n\nPlease reconnect:\n/connect'
        : '⚠️ Ваш сеанс отозван!\n\nПожалуйста переподключитесь:\n/connect';
      
      await ctx.reply(message);
      logger.info({ userId }, 'DeleteMe access denied - session revoked');
      return;
    }

    await ctx.reply(t(lang, 'delete_confirm'), deleteConfirmKeyboard(lang));
    
    logger.info({ userId }, 'Delete confirmation shown');
  } catch (error) {
    logger.error({ error, userId }, 'Error in deleteme handler');
    await ctx.reply('Error. Please try again.');
  }
};

export const handleDeleteConfirm = async (ctx: Context) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  try {
    const user = await BotUser.findOne({ userId });
    const lang = user?.settings.language || 'uz';

    await stopUserBot(userId);
    
    await BotUser.findOneAndUpdate(
      { userId },
      {
        status: 'disabled',
        sessionStatus: 'disconnected',
        action: 'guest',
      }
    );

    await ctx.answerCbQuery();
    await ctx.reply(t(lang, 'deleted'));
    
    logger.info({ userId }, 'User data deleted');
  } catch (error) {
    logger.error({ error, userId }, 'Error deleting user');
    await ctx.answerCbQuery('Error');
  }
};

export const handleDeleteCancel = async (ctx: Context) => {
  await ctx.answerCbQuery('Cancelled');
  await ctx.deleteMessage();
};
