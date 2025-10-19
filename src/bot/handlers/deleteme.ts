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
