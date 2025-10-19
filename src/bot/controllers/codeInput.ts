import { Context } from 'telegraf';
import { handleCodeInput, getCurrentCode } from '../../connect';
import { BotUser } from '../../mongodb/bot.user.schema';
import { createLogger } from '../../utils/logger';
import { numericKeyboard } from '../keyboards';
import { t } from '../i18n';

const logger = createLogger('CodeInput');

export const handleCodeCallback = async (ctx: Context) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const data = (ctx.callbackQuery as any)?.data;
  if (!data?.startsWith('code_')) return;

  const digit = data.replace('code_', '');

  try {
    const user = await BotUser.findOne({ userId });
    if (!user || user.action !== 'awaiting_code') {
      await ctx.answerCbQuery('Not in code input mode');
      return;
    }

    const lang = user.settings.language || 'uz';

    handleCodeInput(userId, digit);
    
    const currentCode = getCurrentCode(userId);
    const stars = '⭐'.repeat(currentCode.length);
    const underscores = '_'.repeat(Math.max(0, 5 - currentCode.length));
    const display = stars + underscores;
    
    await ctx.answerCbQuery();
    await ctx.editMessageText(`${t(lang, 'code_label')} ${display}`, numericKeyboard());
    
    logger.debug({ userId, digit, codeLength: currentCode.length }, 'Code digit added');
  } catch (error) {
    logger.error({ error, userId }, 'Error handling code input');
    await ctx.answerCbQuery('Error');
  }
};
