import { Context } from 'telegraf';
import { Markup } from 'telegraf';
import { BotUser } from '../../mongodb/bot.user.schema';
import { createLogger } from '../../utils/logger';
import { t } from '../i18n';

const logger = createLogger('ParentalControl');

export const handleConnectChild = async (ctx: Context) => {
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
      logger.info({ userId }, 'Connect child access denied - session revoked');
      return;
    }

    await BotUser.findOneAndUpdate(
      { userId },
      { action: 'awaiting_child_search' }
    );

    await ctx.editMessageText(t(lang, 'child_search_prompt'));
    await ctx.answerCbQuery();
    
    logger.info({ userId }, 'Child search initiated');
  } catch (error) {
    logger.error({ error, userId }, 'Error in connect child handler');
    await ctx.answerCbQuery('Error');
  }
};

export const handleMyChildren = async (ctx: Context) => {
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
      
      await ctx.answerCbQuery(message, { show_alert: true });
      logger.info({ userId }, 'My children access denied - session revoked');
      return;
    }
    
    const childConnections = user.childConnections || [];
    
    const relevantChildren = childConnections.filter(
      conn => conn.approvalStatus === 'approved' || conn.approvalStatus === 'disconnected' || conn.approvalStatus === 'pending'
    );

    if (relevantChildren.length === 0) {
      const noChildrenText = lang === 'uz'
        ? '❌ Hech qanday farzand yo\'q.'
        : lang === 'en'
        ? '❌ No children.'
        : '❌ Нет детей.';
      
      await ctx.answerCbQuery(noChildrenText, { show_alert: true });
      return;
    }

    const buttons = [];
    for (const child of relevantChildren) {
      let childName = `Child ${child.childId}`;
      
      try {
        const childTelegramUser = await ctx.telegram.getChat(child.childId);
        if ('first_name' in childTelegramUser) {
          childName = childTelegramUser.first_name || childName;
          if ('username' in childTelegramUser && childTelegramUser.username) {
            childName = `${childName} (@${childTelegramUser.username})`;
          }
        }
      } catch (err) {
        logger.debug({ childId: child.childId }, 'Could not fetch child Telegram info');
      }
      
      const now = new Date();
      const isActive = child.expiresAt && new Date(child.expiresAt) > now;
      const isDisconnected = child.approvalStatus === 'disconnected';
      const isPending = child.approvalStatus === 'pending';
      
      let icon = '⏰';
      if (isPending) {
        icon = '⏳';
      } else if (isDisconnected) {
        icon = '🔌';
      } else if (isActive) {
        icon = '✅';
      }
      
      buttons.push([
        Markup.button.callback(
          `${icon} ${childName}`,
          `pc_child_detail_${child.childId}`
        )
      ]);
    }

    const backText = lang === 'uz' ? '⬅️ Orqaga' : lang === 'en' ? '⬅️ Back' : '⬅️ Назад';
    buttons.push([Markup.button.callback(backText, 'settings_back')]);

    const titleText = lang === 'uz'
      ? '👶 Mening farzandlarim:'
      : lang === 'en'
      ? '👶 My Children:'
      : '👶 Мои дети:';

    await ctx.answerCbQuery();
    await ctx.editMessageText(titleText, Markup.inlineKeyboard(buttons));
    
    logger.info({ userId, count: relevantChildren.length }, 'Children list displayed');
  } catch (error) {
    logger.error({ error, userId }, 'Error showing children list');
    await ctx.answerCbQuery('Error');
  }
};

export const searchChild = async (ctx: Context, searchQuery: string) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  let lang: 'uz' | 'en' | 'ru' = 'uz';

  try {
    const user = await BotUser.findOne({ userId });
    if (!user) return;

    lang = user.settings.language || 'uz';

    let childId: number | null = null;

    if (/^\d+$/.test(searchQuery)) {
      childId = Number(searchQuery);
    } else if (searchQuery.startsWith('@') || searchQuery.startsWith('+')) {
      let foundInDb = false;
      
      if (searchQuery.startsWith('@')) {
        const dbUser = await BotUser.findOne({ username: searchQuery.substring(1) });
        if (dbUser) {
          childId = dbUser.userId;
          foundInDb = true;
          logger.info({ searchQuery, childId }, 'Found user by username in DB');
        }
      } else if (searchQuery.startsWith('+')) {
        const dbUser = await BotUser.findOne({ phoneNumber: searchQuery });
        if (dbUser) {
          childId = dbUser.userId;
          foundInDb = true;
          logger.info({ searchQuery, childId }, 'Found user by phone in DB');
        }
      }
      
      if (!foundInDb) {
        const { getActiveClient } = await import('../../userbot/runUserBot');
        const client = getActiveClient(userId);
        
        if (!client) {
          const notConnectedText = lang === 'uz'
            ? '❌ Avval akkauntingizni ulang: /connect'
            : lang === 'en'
            ? '❌ Connect your account first: /connect'
            : '❌ Сначала подключите аккаунт: /connect';
          
          await ctx.reply(notConnectedText);
          await BotUser.findOneAndUpdate({ userId }, { action: 'done' });
          return;
        }

        try {
          const { Api } = await import('telegram');
          const targetEntity = await client.getEntity(searchQuery);
          
          if (!(targetEntity instanceof Api.User)) {
            const notUserText = lang === 'uz'
              ? '❌ Bu foydalanuvchi emas (guruh yoki kanal).'
              : lang === 'en'
              ? '❌ This is not a user (group or channel).'
              : '❌ Это не пользователь (группа или канал).';
            
            await ctx.reply(notUserText);
            await BotUser.findOneAndUpdate({ userId }, { action: 'done' });
            return;
          }

          childId = Number(targetEntity.id);
          logger.info({ searchQuery, childId }, 'Found user via Telegram API');
        } catch (error: any) {
          logger.warn({ searchQuery, error: error.message }, 'Failed to find user via Telegram API and DB');
          
          const notFoundText = lang === 'uz'
            ? '❌ Foydalanuvchi topilmadi.\n\n💡 Bu user botdan foydalanmagan bo\'lishi mumkin yoki privacy sozlamalari yopiq.'
            : lang === 'en'
            ? '❌ User not found.\n\n💡 This user may not be using the bot or has strict privacy settings.'
            : '❌ Пользователь не найден.\n\n💡 Этот пользователь может не использовать бота или имеет строгие настройки приватности.';
          
          await ctx.reply(notFoundText);
          await BotUser.findOneAndUpdate({ userId }, { action: 'done' });
          return;
        }
      }
    } else {
      const invalidFormatText = lang === 'uz'
        ? '❌ Noto\'g\'ri format. User ID (raqam), @username yoki +998... telefon raqamini kiriting.'
        : lang === 'en'
        ? '❌ Invalid format. Enter User ID (number), @username or +998... phone number.'
        : '❌ Неверный формат. Введите User ID (число), @username или +998... телефон.';
      
      await ctx.reply(invalidFormatText);
      await BotUser.findOneAndUpdate({ userId }, { action: 'done' });
      return;
    }

    if (childId === userId) {
      await ctx.reply(t(lang, 'cannot_connect_self'));
      await BotUser.findOneAndUpdate({ userId }, { action: 'done' });
      return;
    }

    const childUser = await BotUser.findOne({ userId: childId });

    if (!childUser) {
      const notRegisteredText = lang === 'uz'
        ? '❌ Bu foydalanuvchi botdan foydalanmayapti. Avval ularni botga taklif qiling.'
        : lang === 'en'
        ? '❌ This user is not using the bot. Invite them to the bot first.'
        : '❌ Этот пользователь не использует бота. Сначала пригласите его в бот.';
      
      await ctx.reply(notRegisteredText);
      await BotUser.findOneAndUpdate({ userId }, { action: 'done' });
      return;
    }

    const existingConnection = user.childConnections?.find(
      conn => conn.childId === childUser.userId
    );

    if (existingConnection) {
      if (existingConnection.approvalStatus === 'disconnected') {
        const reconnectText = lang === 'uz'
          ? '🔄 Bu farzand disconnect qilingan. Qayta ulanishni xohlaysizmi?'
          : lang === 'en'
          ? '🔄 This child was disconnected. Do you want to reconnect?'
          : '🔄 Этот ребенок был отключен. Хотите переподключиться?';
        
        const keyboard = Markup.inlineKeyboard([
          [Markup.button.callback(
            lang === 'uz' ? '✅ Qayta ulash' : lang === 'en' ? '✅ Reconnect' : '✅ Переподключить',
            `pc_reconnect_child_${childUser.userId}`
          )]
        ]);

        await ctx.reply(reconnectText, keyboard);
        await BotUser.findOneAndUpdate({ userId }, { action: 'done' });
        return;
      } else if (existingConnection.approvalStatus !== 'rejected') {
        await ctx.reply(t(lang, 'already_connected'));
        await BotUser.findOneAndUpdate({ userId }, { action: 'done' });
        return;
      }
    }

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback(
        t(lang, 'send_approval_request'),
        `pc_send_request_${childUser.userId}`
      )]
    ]);

    await ctx.reply(
      `${t(lang, 'child_found')}\n\nUser ID: ${childUser.userId}`,
      keyboard
    );

    await BotUser.findOneAndUpdate({ userId }, { action: 'done' });
    
    logger.info({ userId, childId: childUser.userId }, 'Child found');
  } catch (error) {
    logger.error({ error, userId }, 'Error searching child');
    await ctx.reply(t(lang, 'error'));
  }
};

export const sendApprovalRequest = async (ctx: Context, childId: number) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  try {
    const [parentUser, childUser] = await Promise.all([
      BotUser.findOne({ userId }),
      BotUser.findOne({ userId: childId })
    ]);

    if (!parentUser || !childUser) return;

    const parentLang = parentUser.settings.language || 'uz';
    const childLang = childUser.settings.language || 'uz';

    await BotUser.findOneAndUpdate(
      { userId },
      { 
        $push: { 
          childConnections: {
            childId,
            approvalStatus: 'pending',
            addedAt: new Date()
          }
        }
      }
    );

    await BotUser.findOneAndUpdate(
      { userId: childId },
      { 
        $push: { 
          parentConnections: {
            parentId: userId,
            approvalStatus: 'pending',
            addedAt: new Date()
          }
        }
      }
    );

    const parentName = ctx.from?.first_name || `User ${userId}`;
    const approvalText = `${t(childLang, 'approval_request_title')}\n\n👤 ${parentName} (ID: ${userId}) ${t(childLang, 'approval_request_text')}`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback(
        t(childLang, 'approve_connection'),
        `pc_approve_${userId}`
      )],
      [Markup.button.callback(
        t(childLang, 'reject_connection'),
        `pc_reject_${userId}`
      )]
    ]);

    await ctx.telegram.sendMessage(childId, approvalText, keyboard);

    await ctx.answerCbQuery();
    await ctx.editMessageText(t(parentLang, 'approval_sent'));
    
    logger.info({ userId, childId }, 'Approval request sent');
  } catch (error: any) {
    logger.error({ error, userId, childId }, 'Error sending approval request');
    await ctx.answerCbQuery('Error');
  }
};

export const handleApproval = async (ctx: Context, parentId: number, approved: boolean) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  try {
    const [childUser, parentUser] = await Promise.all([
      BotUser.findOne({ userId }),
      BotUser.findOne({ userId: parentId })
    ]);

    if (!childUser || !parentUser) return;

    const childLang = childUser.settings.language || 'uz';
    const parentLang = parentUser.settings.language || 'uz';

    const status = approved ? 'approved' : 'rejected';

    await BotUser.findOneAndUpdate(
      { userId, 'parentConnections.parentId': parentId },
      { $set: { 'parentConnections.$.approvalStatus': status } }
    );

    await BotUser.findOneAndUpdate(
      { userId: parentId, 'childConnections.childId': userId },
      { $set: { 'childConnections.$.approvalStatus': status } }
    );

    await ctx.answerCbQuery();
    await ctx.editMessageText(
      approved ? t(childLang, 'connection_approved') : t(childLang, 'connection_rejected')
    );

    if (approved) {
      let childName = 'Child';
      try {
        const childTelegramUser = await ctx.telegram.getChat(userId);
        if ('first_name' in childTelegramUser) {
          childName = childTelegramUser.first_name || `Child ${userId}`;
        }
      } catch (err) {
        childName = `Child ${userId}`;
      }

      const approvalMessage = parentLang === 'uz'
        ? `✅ ${childName} ulandi!\n\n💰 Monitoring xizmatini boshlash uchun 50 ⭐️ to'lang (30 kun):`
        : parentLang === 'en'
        ? `✅ ${childName} connected!\n\n💰 Pay 50 ⭐️ to start monitoring (30 days):`
        : `✅ ${childName} подключён!\n\n💰 Оплатите 50 ⭐️ для мониторинга (30 дней):`;

      const payButton = parentLang === 'uz'
        ? '💳 50 ⭐️ To\'lash'
        : parentLang === 'en'
        ? '💳 Pay 50 ⭐️'
        : '💳 Оплатить 50 ⭐️';

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback(payButton, `pc_pay_monitoring_${userId}`)]
      ]);

      await ctx.telegram.sendMessage(parentId, approvalMessage, keyboard);
    } else {
      await ctx.telegram.sendMessage(
        parentId,
        t(parentLang, 'parent_notified_rejected')
      );
    }
    
    logger.info({ userId, parentId, approved }, 'Connection approval handled');
  } catch (error) {
    logger.error({ error, userId, parentId, approved }, 'Error handling approval');
    await ctx.answerCbQuery('Error');
  }
};

export const viewParentConnections = async (ctx: Context) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  try {
    const user = await BotUser.findOne({ userId });
    if (!user) return;

    const lang = user.settings.language || 'uz';
    const parentConnections = user.parentConnections || [];
    
    const relevantParents = parentConnections.filter(
      conn => conn.approvalStatus === 'approved' || conn.approvalStatus === 'disconnected' || conn.approvalStatus === 'pending'
    );

    if (relevantParents.length === 0) {
      await ctx.answerCbQuery(t(lang, 'no_parents'), { show_alert: true });
      return;
    }

    const buttons = [];
    for (const parent of relevantParents) {
      let parentName = `Parent ${parent.parentId}`;
      
      try {
        const parentTelegramUser = await ctx.telegram.getChat(parent.parentId);
        if ('first_name' in parentTelegramUser) {
          parentName = parentTelegramUser.first_name || parentName;
          if ('username' in parentTelegramUser && parentTelegramUser.username) {
            parentName = `${parentName} (@${parentTelegramUser.username})`;
          }
        }
      } catch (err) {
        logger.debug({ parentId: parent.parentId }, 'Could not fetch parent Telegram info');
      }
      
      const now = new Date();
      const isActive = parent.expiresAt && new Date(parent.expiresAt) > now;
      const isDisconnected = parent.approvalStatus === 'disconnected';
      const isPending = parent.approvalStatus === 'pending';
      
      let icon = '⏰';
      if (isPending) {
        icon = '⏳';
      } else if (isDisconnected) {
        icon = '🔌';
      } else if (isActive) {
        icon = '✅';
      }
      
      buttons.push([
        Markup.button.callback(
          `${icon} ${parentName}`,
          `pc_view_parent_${parent.parentId}`
        )
      ]);
    }

    const backText = lang === 'uz' ? '⬅️ Orqaga' : lang === 'en' ? '⬅️ Back' : '⬅️ Назад';
    buttons.push([Markup.button.callback(backText, 'settings_back')]);

    await ctx.answerCbQuery();
    await ctx.editMessageText(t(lang, 'connected_parents'), Markup.inlineKeyboard(buttons));
    
    logger.info({ userId, count: relevantParents.length }, 'Parent connections displayed');
  } catch (error) {
    logger.error({ error, userId }, 'Error viewing parent connections');
    await ctx.answerCbQuery('Error');
  }
};

export const viewParentDetail = async (ctx: Context, parentId: number) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  try {
    const user = await BotUser.findOne({ userId });
    if (!user) return;

    const lang = user.settings.language || 'uz';
    const parentConnection = user.parentConnections?.find(
      conn => conn.parentId === parentId
    );

    if (!parentConnection) {
      await ctx.answerCbQuery('Not found');
      return;
    }

    let parentName = `Parent ${parentId}`;
    
    try {
      const parentTelegramUser = await ctx.telegram.getChat(parentId);
      if ('first_name' in parentTelegramUser) {
        parentName = parentTelegramUser.first_name || parentName;
        if ('username' in parentTelegramUser && parentTelegramUser.username) {
          parentName = `${parentName} (@${parentTelegramUser.username})`;
        }
      }
    } catch (err) {
      logger.debug({ parentId }, 'Could not fetch parent Telegram info');
    }
    
    const isDisconnected = parentConnection.approvalStatus === 'disconnected';
    const isPending = parentConnection.approvalStatus === 'pending';
    const expiryText = parentConnection.expiresAt
      ? `\n⏰ ${new Date(parentConnection.expiresAt).toLocaleDateString()}`
      : '';

    let statusText = '';
    if (isPending) {
      statusText = lang === 'uz' 
        ? '\n⏳ Kutilmoqda (siz javob bermagansiz)' 
        : lang === 'en' 
        ? '\n⏳ Pending (you need to respond)' 
        : '\n⏳ Ожидание (вы не ответили)';
    } else if (isDisconnected) {
      statusText = lang === 'uz' ? '\n🔌 Uzilgan' : lang === 'en' ? '\n🔌 Disconnected' : '\n🔌 Отключен';
    }

    const detailText = `👤 ${parentName}\nID: ${parentId}${expiryText}${statusText}`;

    const backText = lang === 'uz' ? '⬅️ Orqaga' : lang === 'en' ? '⬅️ Back' : '⬅️ Назад';
    
    const buttons = [];
    
    if (isPending) {
      const infoText = lang === 'uz' 
        ? 'ℹ️ Xabarlarni tekshiring' 
        : lang === 'en' 
        ? 'ℹ️ Check your messages' 
        : 'ℹ️ Проверьте сообщения';
      buttons.push([Markup.button.callback(infoText, 'noop')]);
    } else if (isDisconnected) {
      const reconnectText = lang === 'uz' ? '🔄 Qayta ulash' : lang === 'en' ? '🔄 Reconnect' : '🔄 Переподключить';
      const deleteText = lang === 'uz' ? '🗑 O\'chirish' : lang === 'en' ? '🗑 Delete' : '🗑 Удалить';
      buttons.push(
        [Markup.button.callback(reconnectText, `pc_reconnect_parent_${parentId}`)],
        [Markup.button.callback(deleteText, `pc_delete_parent_${parentId}`)]
      );
    } else {
      buttons.push([Markup.button.callback(t(lang, 'disconnect_btn'), `pc_disconnect_parent_${parentId}`)]);
    }
    
    buttons.push([Markup.button.callback(backText, 'view_parent_connections')]);
    
    const keyboard = Markup.inlineKeyboard(buttons);

    await ctx.answerCbQuery();
    await ctx.editMessageText(detailText, keyboard);
    
    logger.info({ userId, parentId }, 'Parent detail displayed');
  } catch (error) {
    logger.error({ error, userId, parentId }, 'Error viewing parent detail');
    await ctx.answerCbQuery('Error');
  }
};

export const disconnectFromParent = async (ctx: Context, parentId: number) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  try {
    const [childUser, parentUser] = await Promise.all([
      BotUser.findOne({ userId }),
      BotUser.findOne({ userId: parentId })
    ]);

    if (!childUser || !parentUser) return;

    const childLang = childUser.settings.language || 'uz';
    const parentLang = parentUser.settings.language || 'uz';

    await BotUser.findOneAndUpdate(
      { userId, 'parentConnections.parentId': parentId },
      { $set: { 'parentConnections.$.approvalStatus': 'disconnected' } }
    );

    await BotUser.findOneAndUpdate(
      { userId: parentId, 'childConnections.childId': userId },
      { $set: { 'childConnections.$.approvalStatus': 'disconnected' } }
    );

    await ctx.answerCbQuery();
    await ctx.editMessageText(t(childLang, 'parent_disconnect_success'));

    await ctx.telegram.sendMessage(parentId, t(parentLang, 'child_disconnected'));
    
    logger.info({ userId, parentId }, 'Disconnected from parent');
  } catch (error) {
    logger.error({ error, userId, parentId }, 'Error disconnecting from parent');
    await ctx.answerCbQuery('Error');
  }
};

export const disconnectFromChild = async (ctx: Context, childId: number) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  try {
    const [parentUser, childUser] = await Promise.all([
      BotUser.findOne({ userId }),
      BotUser.findOne({ userId: childId })
    ]);

    if (!parentUser || !childUser) return;

    const parentLang = parentUser.settings.language || 'uz';
    const childLang = childUser.settings.language || 'uz';

    await BotUser.findOneAndUpdate(
      { userId, 'childConnections.childId': childId },
      { $set: { 'childConnections.$.approvalStatus': 'disconnected' } }
    );

    await BotUser.findOneAndUpdate(
      { userId: childId, 'parentConnections.parentId': userId },
      { $set: { 'parentConnections.$.approvalStatus': 'disconnected' } }
    );

    await ctx.answerCbQuery();
    await ctx.editMessageText(t(parentLang, 'child_disconnected'));

    await ctx.telegram.sendMessage(childId, t(childLang, 'parent_disconnect_success'));
    
    logger.info({ userId, childId }, 'Disconnected from child');
  } catch (error) {
    logger.error({ error, userId, childId }, 'Error disconnecting from child');
    await ctx.answerCbQuery('Error');
  }
};

export const reconnectChild = async (ctx: Context, childId: number) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  try {
    const [parentUser, childUser] = await Promise.all([
      BotUser.findOne({ userId }),
      BotUser.findOne({ userId: childId })
    ]);

    if (!parentUser || !childUser) return;

    const parentLang = parentUser.settings.language || 'uz';
    const childLang = childUser.settings.language || 'uz';

    await BotUser.findOneAndUpdate(
      { userId, 'childConnections.childId': childId },
      { $set: { 'childConnections.$.approvalStatus': 'pending' } }
    );

    await BotUser.findOneAndUpdate(
      { userId: childId, 'parentConnections.parentId': userId },
      { $set: { 'parentConnections.$.approvalStatus': 'pending' } }
    );

    let parentName = 'Parent';
    try {
      const parentTelegramUser = await ctx.telegram.getChat(userId);
      if ('first_name' in parentTelegramUser) {
        parentName = parentTelegramUser.first_name || parentName;
      }
    } catch (err) {
      logger.debug({ userId }, 'Could not fetch parent name');
    }

    const approvalText = childLang === 'uz'
      ? `🔄 Qayta ulanish so'rovi\n\n👤 ${parentName} (ID: ${userId}) qayta ulanishni so'rayapti. Roziligingizni bering:`
      : childLang === 'en'
      ? `🔄 Reconnection Request\n\n👤 ${parentName} (ID: ${userId}) wants to reconnect. Please approve:`
      : `🔄 Запрос на переподключение\n\n👤 ${parentName} (ID: ${userId}) хочет переподключиться. Подтвердите:`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback(
        childLang === 'uz' ? '✅ Rozi' : childLang === 'en' ? '✅ Approve' : '✅ Одобрить',
        `pc_approve_reconnect_${userId}`
      )],
      [Markup.button.callback(
        childLang === 'uz' ? '❌ Rad etish' : childLang === 'en' ? '❌ Reject' : '❌ Отклонить',
        `pc_reject_reconnect_${userId}`
      )]
    ]);

    await ctx.telegram.sendMessage(childId, approvalText, keyboard);

    const sentText = parentLang === 'uz'
      ? '📤 Qayta ulanish so\'rovi yuborildi. Farzandning javobini kuting.'
      : parentLang === 'en'
      ? '📤 Reconnection request sent. Waiting for child\'s approval.'
      : '📤 Запрос на переподключение отправлен. Ожидание ответа.';

    await ctx.answerCbQuery();
    await ctx.editMessageText(sentText);
    
    logger.info({ userId, childId }, 'Reconnection request sent to child');
  } catch (error) {
    logger.error({ error, userId, childId }, 'Error sending reconnection request');
    await ctx.answerCbQuery('Error');
  }
};

export const reconnectParent = async (ctx: Context, parentId: number) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  try {
    const [childUser, parentUser] = await Promise.all([
      BotUser.findOne({ userId }),
      BotUser.findOne({ userId: parentId })
    ]);

    if (!childUser || !parentUser) return;

    const childLang = childUser.settings.language || 'uz';
    const parentLang = parentUser.settings.language || 'uz';

    await BotUser.findOneAndUpdate(
      { userId, 'parentConnections.parentId': parentId },
      { $set: { 
        'parentConnections.$.approvalStatus': 'approved'
      }}
    );

    await BotUser.findOneAndUpdate(
      { userId: parentId, 'childConnections.childId': userId },
      { $set: { 
        'childConnections.$.approvalStatus': 'approved'
      }}
    );

    const successText = childLang === 'uz'
      ? '✅ Ota-ona qayta ulandi!'
      : childLang === 'en'
      ? '✅ Parent reconnected!'
      : '✅ Родитель переподключён!';

    await ctx.answerCbQuery();
    await ctx.editMessageText(successText);

    let childName = 'Child';
    try {
      const childTelegramUser = await ctx.telegram.getChat(userId);
      if ('first_name' in childTelegramUser) {
        childName = childTelegramUser.first_name || `Child ${userId}`;
      }
    } catch (err) {
      childName = `Child ${userId}`;
    }

    const notifyText = parentLang === 'uz'
      ? `🔄 ${childName} qayta ulandi!\n\n💰 Monitoring xizmatini boshlash uchun 50 ⭐️ to'lang (30 kun):`
      : parentLang === 'en'
      ? `🔄 ${childName} reconnected!\n\n💰 Pay 50 ⭐️ to start monitoring (30 days):`
      : `🔄 ${childName} переподключён!\n\n💰 Оплатите 50 ⭐️ для мониторинга (30 дней):`;

    const payButton = parentLang === 'uz'
      ? '💳 50 ⭐️ To\'lash'
      : parentLang === 'en'
      ? '💳 Pay 50 ⭐️'
      : '💳 Оплатить 50 ⭐️';

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback(payButton, `pc_pay_monitoring_${userId}`)]
    ]);

    await ctx.telegram.sendMessage(parentId, notifyText, keyboard);
    
    logger.info({ userId, parentId }, 'Reconnected parent');
  } catch (error) {
    logger.error({ error, userId, parentId }, 'Error reconnecting parent');
    await ctx.answerCbQuery('Error');
  }
};

export const deleteChild = async (ctx: Context, childId: number) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  try {
    const lang = (await BotUser.findOne({ userId }))?.settings.language || 'uz';

    await BotUser.findOneAndUpdate(
      { userId },
      { $pull: { childConnections: { childId } } }
    );

    await BotUser.findOneAndUpdate(
      { userId: childId },
      { $pull: { parentConnections: { parentId: userId } } }
    );

    const successText = lang === 'uz'
      ? '🗑 Farzand o\'chirildi!'
      : lang === 'en'
      ? '🗑 Child deleted!'
      : '🗑 Ребёнок удалён!';

    await ctx.answerCbQuery();
    await ctx.editMessageText(successText);
    
    logger.info({ userId, childId }, 'Deleted child connection');
  } catch (error) {
    logger.error({ error, userId, childId }, 'Error deleting child');
    await ctx.answerCbQuery('Error');
  }
};

export const deleteParent = async (ctx: Context, parentId: number) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  try {
    const lang = (await BotUser.findOne({ userId }))?.settings.language || 'uz';

    await BotUser.findOneAndUpdate(
      { userId },
      { $pull: { parentConnections: { parentId } } }
    );

    await BotUser.findOneAndUpdate(
      { userId: parentId },
      { $pull: { childConnections: { childId: userId } } }
    );

    const successText = lang === 'uz'
      ? '🗑 Ota-ona o\'chirildi!'
      : lang === 'en'
      ? '🗑 Parent deleted!'
      : '🗑 Родитель удалён!';

    await ctx.answerCbQuery();
    await ctx.editMessageText(successText);
    
    logger.info({ userId, parentId }, 'Deleted parent connection');
  } catch (error) {
    logger.error({ error, userId, parentId }, 'Error deleting parent');
    await ctx.answerCbQuery('Error');
  }
};

export const handleReconnectApproval = async (ctx: Context, parentId: number, approved: boolean) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  try {
    const [childUser, parentUser] = await Promise.all([
      BotUser.findOne({ userId }),
      BotUser.findOne({ userId: parentId })
    ]);

    if (!childUser || !parentUser) return;

    const childLang = childUser.settings.language || 'uz';
    const parentLang = parentUser.settings.language || 'uz';

    const status = approved ? 'approved' : 'disconnected';

    if (approved) {
      const now = new Date();
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      
      const childConnection = childUser.parentConnections?.find(pc => pc.parentId === parentId);
      const childExpiresAt = childConnection?.expiresAt && new Date(childConnection.expiresAt) > now
        ? new Date(new Date(childConnection.expiresAt).getTime() + thirtyDaysMs)
        : new Date(now.getTime() + thirtyDaysMs);

      await BotUser.findOneAndUpdate(
        { userId, 'parentConnections.parentId': parentId },
        { $set: { 
          'parentConnections.$.approvalStatus': status,
          'parentConnections.$.expiresAt': childExpiresAt
        }}
      );

      const parentConnection = parentUser.childConnections?.find(cc => cc.childId === userId);
      const parentExpiresAt = parentConnection?.expiresAt && new Date(parentConnection.expiresAt) > now
        ? new Date(new Date(parentConnection.expiresAt).getTime() + thirtyDaysMs)
        : new Date(now.getTime() + thirtyDaysMs);

      await BotUser.findOneAndUpdate(
        { userId: parentId, 'childConnections.childId': userId },
        { $set: { 
          'childConnections.$.approvalStatus': status,
          'childConnections.$.expiresAt': parentExpiresAt
        }}
      );
    } else {
      await BotUser.findOneAndUpdate(
        { userId, 'parentConnections.parentId': parentId },
        { $set: { 'parentConnections.$.approvalStatus': status } }
      );

      await BotUser.findOneAndUpdate(
        { userId: parentId, 'childConnections.childId': userId },
        { $set: { 'childConnections.$.approvalStatus': status } }
      );
    }

    const childText = approved
      ? (childLang === 'uz' ? '✅ Siz qayta ulanishga rozi bo\'ldingiz!' : childLang === 'en' ? '✅ You approved the reconnection!' : '✅ Вы одобрили переподключение!')
      : (childLang === 'uz' ? '❌ Siz qayta ulanishni rad etdingiz!' : childLang === 'en' ? '❌ You rejected the reconnection!' : '❌ Вы отклонили переподключение!');

    await ctx.answerCbQuery();
    await ctx.editMessageText(childText);

    const parentText = approved
      ? (parentLang === 'uz' ? '✅ Farzand qayta ulanishga rozi bo\'ldi!' : parentLang === 'en' ? '✅ Child approved reconnection!' : '✅ Ребёнок одобрил переподключение!')
      : (parentLang === 'uz' ? '❌ Farzand qayta ulanishni rad etdi!' : parentLang === 'en' ? '❌ Child rejected reconnection!' : '❌ Ребёнок отклонил переподключение!');

    await ctx.telegram.sendMessage(parentId, parentText);
    
    logger.info({ userId, parentId, approved }, 'Reconnection approval handled');
  } catch (error) {
    logger.error({ error, userId, parentId, approved }, 'Error handling reconnection approval');
    await ctx.answerCbQuery('Error');
  }
};

export const viewChildDetail = async (ctx: Context, childId: number) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  try {
    const user = await BotUser.findOne({ userId });
    if (!user) return;

    const lang = user.settings.language || 'uz';
    const childConnection = user.childConnections?.find(
      conn => conn.childId === childId
    );

    if (!childConnection) {
      await ctx.answerCbQuery('Not found');
      return;
    }

    let childName = `Child ${childId}`;
    
    try {
      const childTelegramUser = await ctx.telegram.getChat(childId);
      if ('first_name' in childTelegramUser) {
        childName = childTelegramUser.first_name || childName;
        if ('username' in childTelegramUser && childTelegramUser.username) {
          childName = `${childName} (@${childTelegramUser.username})`;
        }
      }
    } catch (err) {
      logger.debug({ childId }, 'Could not fetch child Telegram info');
    }
    
    const isDisconnected = childConnection.approvalStatus === 'disconnected';
    const isPending = childConnection.approvalStatus === 'pending';
    const now = new Date();
    const isActive = childConnection.expiresAt && new Date(childConnection.expiresAt) > now;
    
    let statusText = '';
    if (isPending) {
      statusText = lang === 'uz' 
        ? '\n⏳ Kutilmoqda (farzand javob bermagan)' 
        : lang === 'en' 
        ? '\n⏳ Pending (waiting for child approval)' 
        : '\n⏳ Ожидание (ждём ответа ребёнка)';
    } else if (isDisconnected) {
      statusText = lang === 'uz' 
        ? '\n🔌 Uzilgan' 
        : lang === 'en' 
        ? '\n🔌 Disconnected' 
        : '\n🔌 Отключен';
    } else if (isActive) {
      const daysRemaining = Math.ceil((new Date(childConnection.expiresAt!).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      statusText = lang === 'uz'
        ? `\n✅ Faol: ${daysRemaining} kun qoldi`
        : lang === 'en'
        ? `\n✅ Active: ${daysRemaining} days left`
        : `\n✅ Активно: ${daysRemaining} дней осталось`;
    } else {
      statusText = lang === 'uz'
        ? '\n⏰ Monitoring muddati tugadi'
        : lang === 'en'
        ? '\n⏰ Monitoring expired'
        : '\n⏰ Мониторинг истёк';
    }

    const detailText = `👤 ${childName}\nID: ${childId}${statusText}`;

    const backText = lang === 'uz' ? '⬅️ Orqaga' : lang === 'en' ? '⬅️ Back' : '⬅️ Назад';
    
    const buttons = [];
    
    if (isPending) {
      const waitingText = lang === 'uz' 
        ? '⏳ Farzandning javobini kuting...' 
        : lang === 'en' 
        ? '⏳ Waiting for child response...' 
        : '⏳ Ожидание ответа ребёнка...';
      buttons.push([Markup.button.callback(waitingText, 'noop')]);
    } else if (isDisconnected) {
      const reconnectText = lang === 'uz' ? '🔄 Qayta ulash' : lang === 'en' ? '🔄 Reconnect' : '🔄 Переподключить';
      const deleteText = lang === 'uz' ? '🗑 O\'chirish' : lang === 'en' ? '🗑 Delete' : '🗑 Удалить';
      buttons.push(
        [Markup.button.callback(reconnectText, `pc_reconnect_child_${childId}`)],
        [Markup.button.callback(deleteText, `pc_delete_child_${childId}`)]
      );
    } else {
      buttons.push(
        [Markup.button.callback(t(lang, 'pay_monitoring'), `pc_pay_monitoring_${childId}`)],
        [Markup.button.callback(t(lang, 'disconnect_btn'), `pc_disconnect_child_${childId}`)]
      );
    }
    
    buttons.push([Markup.button.callback(backText, 'pc_my_children')]);
    
    const keyboard = Markup.inlineKeyboard(buttons);

    await ctx.answerCbQuery();
    await ctx.editMessageText(detailText, keyboard);
    
    logger.info({ userId, childId, isActive, isDisconnected }, 'Child detail displayed');
  } catch (error) {
    logger.error({ error, userId, childId }, 'Error viewing child detail');
    await ctx.answerCbQuery('Error');
  }
};
