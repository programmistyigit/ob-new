import { Context } from 'telegraf';
import { BotUser } from '../../mongodb/bot.user.schema';
import { handlePasswordInput } from '../../connect';
import { createLogger } from '../../utils/logger';
import { t } from '../i18n';
import { searchChild } from '../handlers/parentalControl';

const logger = createLogger('TextInput');

export const handleTextInput = async (ctx: Context) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const text = (ctx.message as any)?.text;
  if (!text || text.startsWith('/')) return;

  try {
    const user = await BotUser.findOne({ userId });
    if (!user) return;

    const lang = user.settings.language || 'uz';

    if (user.action === 'awaiting_2fa') {
      handlePasswordInput(userId, text);
      await ctx.reply('Processing 2FA...');
      logger.info({ userId }, '2FA password submitted');
      return;
    }

    if (user.action === 'awaiting_child_search') {
      await searchChild(ctx, text);
      return;
    }

    await ctx.reply(t(lang, 'help'));
  } catch (error) {
    logger.error({ error, userId }, 'Error handling text input');
    await ctx.reply('Error. Please try again.');
  }
};
