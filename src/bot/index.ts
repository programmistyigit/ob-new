import { Telegraf } from 'telegraf';
import { env } from '../config/env';
import { createLogger } from '../utils/logger';
import { handleStart, handleConnect, handleContact, handleSettings, handleToggleSaved, handleDeleteMe, handleDeleteConfirm, handleDeleteCancel, handleToggleMessage, handleToggleMedia, handleDisableArchive, handleSettingsBack, handleParentalControl, handleConnectChild, handleMyChildren, sendApprovalRequest, handleApproval, viewParentConnections, viewParentDetail, disconnectFromParent, disconnectFromChild, viewChildDetail, reconnectChild, reconnectParent, deleteChild, deleteParent, handleReconnectApproval } from './handlers';
import { handleGroupArchive, handleAddGroup, handleSelectGroup, handleGroupManage, handleToggleGroupMessages, handleToggleGroupMedia, handleRemoveGroup } from './handlers/groupArchive';
import { handlePrivateArchive, handleAddPrivateChat, handleSelectPrivateChat, handlePrivateChatManage, handleTogglePrivateMessages, handleTogglePrivateMedia, handleRemovePrivateChat, handleUsersShared } from './handlers/privateArchive';
import { createStarsInvoice, handleSuccessfulPayment, handlePreCheckoutQuery, createMonitoringInvoice, handleMonitoringPayment } from './payments';
import { handleCodeCallback } from './controllers/codeInput';
import { handleTextInput } from './controllers/textInput';
import { BotUser } from '../mongodb/bot.user.schema';
import { t } from './i18n';
import { shareTermsKeyboard, contactKeyboard } from './keyboards';

const logger = createLogger('Bot');

let botInstance: Telegraf | null = null;

export const getBot = (): Telegraf | null => {
  return botInstance;
};

export const createBot = (): Telegraf => {
  const bot = new Telegraf(env.BOT_TOKEN);
  botInstance = bot;

  bot.command('start', handleStart);
  bot.command('connect', handleConnect);
  bot.command('settings', (ctx) => handleSettings(ctx, false));
  bot.command('deleteme', handleDeleteMe);
  bot.command('help', async (ctx) => {
    await ctx.reply(`📖 Help:

/start - Start
/connect - Connect account
/settings - Settings
/deleteme - Delete data`);
  });

  bot.action('pay_stars', async (ctx) => {
    const userId = ctx.from?.id;
    if (userId) {
      await createStarsInvoice(ctx, userId);
    }
    await ctx.answerCbQuery();
  });

  bot.action('pay_share', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    try {
      const user = await BotUser.findOne({ userId });
      const lang = user?.settings.language || 'uz';
      
      await ctx.answerCbQuery();
      await ctx.reply(t(lang, 'share_terms'), shareTermsKeyboard(lang));
    } catch (error) {
      logger.error({ error, userId }, 'Error in pay_share handler');
      await ctx.answerCbQuery();
      await ctx.reply('Error. Please try again.');
    }
  });

  bot.action('continue_share', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    try {
      const user = await BotUser.findOne({ userId });
      const lang = user?.settings.language || 'uz';

      await BotUser.findOneAndUpdate(
        { userId },
        { action: 'awaiting_share_contact' }
      );

      await ctx.answerCbQuery();
      await ctx.reply(t(lang, 'share_contact_request'), contactKeyboard(lang));
      
      logger.info({ userId }, 'Share activation initiated');
    } catch (error) {
      logger.error({ error, userId }, 'Error in continue_share handler');
      await ctx.answerCbQuery();
      await ctx.reply('Error. Please try again.');
    }
  });

  bot.action(/^code_/, handleCodeCallback);
  
  bot.action('toggle_saved', handleToggleSaved);
  bot.action('toggle_message', handleToggleMessage);
  bot.action('toggle_media', handleToggleMedia);
  bot.action('disable_archive', handleDisableArchive);
  bot.action('settings_back', handleSettingsBack);
  bot.action('parental_control', handleParentalControl);
  bot.action('pc_connect_child', handleConnectChild);
  bot.action('pc_my_children', handleMyChildren);
  
  bot.action('group_archive', handleGroupArchive);
  bot.action('ga_add_group', handleAddGroup);
  
  bot.action(/^ga_select_(-?\d+)$/, async (ctx) => {
    const match = ctx.match;
    if (match && match[1]) {
      await handleSelectGroup(ctx, match[1]);
    }
  });
  
  bot.action(/^ga_group_(-?\d+)$/, async (ctx) => {
    const match = ctx.match;
    if (match && match[1]) {
      await handleGroupManage(ctx, match[1]);
    }
  });
  
  bot.action(/^ga_toggle_msg_(-?\d+)$/, async (ctx) => {
    const match = ctx.match;
    if (match && match[1]) {
      await handleToggleGroupMessages(ctx, match[1]);
    }
  });
  
  bot.action(/^ga_toggle_media_(-?\d+)$/, async (ctx) => {
    const match = ctx.match;
    if (match && match[1]) {
      await handleToggleGroupMedia(ctx, match[1]);
    }
  });
  
  bot.action(/^ga_remove_(-?\d+)$/, async (ctx) => {
    const match = ctx.match;
    if (match && match[1]) {
      await handleRemoveGroup(ctx, match[1]);
    }
  });
  
  bot.action('private_archive', handlePrivateArchive);
  bot.action('pa_add_chat', handleAddPrivateChat);
  
  bot.action(/^pa_select_(-?\d+)$/, async (ctx) => {
    const match = ctx.match;
    if (match && match[1]) {
      await handleSelectPrivateChat(ctx, match[1]);
    }
  });
  
  bot.action(/^pa_chat_(-?\d+)$/, async (ctx) => {
    const match = ctx.match;
    if (match && match[1]) {
      await handlePrivateChatManage(ctx, match[1]);
    }
  });
  
  bot.action(/^pa_toggle_msg_(-?\d+)$/, async (ctx) => {
    const match = ctx.match;
    if (match && match[1]) {
      await handleTogglePrivateMessages(ctx, match[1]);
    }
  });
  
  bot.action(/^pa_toggle_media_(-?\d+)$/, async (ctx) => {
    const match = ctx.match;
    if (match && match[1]) {
      await handleTogglePrivateMedia(ctx, match[1]);
    }
  });
  
  bot.action(/^pa_remove_(-?\d+)$/, async (ctx) => {
    const match = ctx.match;
    if (match && match[1]) {
      await handleRemovePrivateChat(ctx, match[1]);
    }
  });
  
  bot.action(/^pc_send_request_(\d+)$/, async (ctx) => {
    const match = ctx.match;
    if (match && match[1]) {
      const childId = Number(match[1]);
      await sendApprovalRequest(ctx, childId);
    }
  });
  
  bot.action(/^pc_approve_(\d+)$/, async (ctx) => {
    const match = ctx.match;
    if (match && match[1]) {
      const parentId = Number(match[1]);
      await handleApproval(ctx, parentId, true);
    }
  });
  
  bot.action(/^pc_reject_(\d+)$/, async (ctx) => {
    const match = ctx.match;
    if (match && match[1]) {
      const parentId = Number(match[1]);
      await handleApproval(ctx, parentId, false);
    }
  });
  
  bot.action(/^pc_approve_reconnect_(\d+)$/, async (ctx) => {
    const match = ctx.match;
    if (match && match[1]) {
      const parentId = Number(match[1]);
      await handleReconnectApproval(ctx, parentId, true);
    }
  });
  
  bot.action(/^pc_reject_reconnect_(\d+)$/, async (ctx) => {
    const match = ctx.match;
    if (match && match[1]) {
      const parentId = Number(match[1]);
      await handleReconnectApproval(ctx, parentId, false);
    }
  });
  
  bot.action('view_parent_connections', viewParentConnections);
  
  bot.action(/^pc_view_parent_(\d+)$/, async (ctx) => {
    const match = ctx.match;
    if (match && match[1]) {
      const parentId = Number(match[1]);
      await viewParentDetail(ctx, parentId);
    }
  });
  
  bot.action(/^pc_disconnect_parent_(\d+)$/, async (ctx) => {
    const match = ctx.match;
    if (match && match[1]) {
      const parentId = Number(match[1]);
      await disconnectFromParent(ctx, parentId);
    }
  });
  
  bot.action(/^pc_disconnect_child_(\d+)$/, async (ctx) => {
    const match = ctx.match;
    if (match && match[1]) {
      const childId = Number(match[1]);
      await disconnectFromChild(ctx, childId);
    }
  });
  
  bot.action(/^pc_reconnect_child_(\d+)$/, async (ctx) => {
    const match = ctx.match;
    if (match && match[1]) {
      const childId = Number(match[1]);
      await reconnectChild(ctx, childId);
    }
  });
  
  bot.action(/^pc_reconnect_parent_(\d+)$/, async (ctx) => {
    const match = ctx.match;
    if (match && match[1]) {
      const parentId = Number(match[1]);
      await reconnectParent(ctx, parentId);
    }
  });
  
  bot.action(/^pc_delete_child_(\d+)$/, async (ctx) => {
    const match = ctx.match;
    if (match && match[1]) {
      const childId = Number(match[1]);
      await deleteChild(ctx, childId);
    }
  });
  
  bot.action(/^pc_delete_parent_(\d+)$/, async (ctx) => {
    const match = ctx.match;
    if (match && match[1]) {
      const parentId = Number(match[1]);
      await deleteParent(ctx, parentId);
    }
  });
  
  bot.action(/^pc_child_detail_(\d+)$/, async (ctx) => {
    const match = ctx.match;
    if (match && match[1]) {
      const childId = Number(match[1]);
      await viewChildDetail(ctx, childId);
    }
  });
  
  bot.action(/^pc_pay_monitoring_(\d+)$/, async (ctx) => {
    const match = ctx.match;
    const userId = ctx.from?.id;
    if (match && match[1] && userId) {
      const childId = Number(match[1]);
      await createMonitoringInvoice(ctx, userId, childId);
    }
    await ctx.answerCbQuery();
  });
  
  bot.action('noop', async (ctx) => {
    await ctx.answerCbQuery();
  });
  
  bot.action('delete_confirm_yes', handleDeleteConfirm);
  bot.action('delete_confirm_no', handleDeleteCancel);

  bot.on('contact', handleContact);
  bot.on('users_shared', handleUsersShared);
  
  bot.on('pre_checkout_query', handlePreCheckoutQuery);
  bot.on('successful_payment', async (ctx) => {
    const payload = (ctx.message as any)?.successful_payment?.invoice_payload;
    if (payload?.startsWith('monitoring_')) {
      await handleMonitoringPayment(ctx);
    } else {
      await handleSuccessfulPayment(ctx);
    }
  });

  bot.on('text', handleTextInput);

  bot.catch((err, ctx) => {
    logger.error({ err, userId: ctx.from?.id }, 'Bot error');
  });

  logger.info('Bot initialized');

  return bot;
};
