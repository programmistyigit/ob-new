import { Context } from 'telegraf';
import { BotUser } from '../../mongodb/bot.user.schema';
import { createLogger } from '../../utils/logger';
import { privateArchiveKeyboard, privateManageKeyboard } from '../keyboards';
import { getActiveClient } from '../../userbot/runUserBot';

const logger = createLogger('PrivateArchiveHandler');

export const handlePrivateArchive = async (ctx: Context) => {
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
      logger.info({ userId }, 'Private archive access denied - session revoked');
      return;
    }

    const chats = user.privateArchive || [];

    const menuText = lang === 'uz'
      ? `💬 Arxiv istisnolari\n\n${chats.length > 0 ? `Istisnolar: ${chats.length} ta chat` : 'Hali istisnolar yo\'q'}\n\n💡 Default: Barcha chatlar arxivlanadi.\nBu ro'yxatdagi chatlar uchun maxsus sozlamalar.`
      : lang === 'en'
      ? `💬 Archive Exceptions\n\n${chats.length > 0 ? `Exceptions: ${chats.length} chats` : 'No exceptions yet'}\n\n💡 Default: All chats are archived.\nCustom settings for chats in this list.`
      : `💬 Исключения архива\n\n${chats.length > 0 ? `Исключений: ${chats.length} чатов` : 'Исключений пока нет'}\n\n💡 По умолчанию: Все чаты архивируются.\nПользовательские настройки для чатов в этом списке.`;

    const keyboard = privateArchiveKeyboard(chats, lang);

    await ctx.editMessageText(menuText, keyboard);
    await ctx.answerCbQuery();
    
    logger.info({ userId, chatCount: chats.length }, 'Private archive menu displayed');
  } catch (error) {
    logger.error({ error, userId }, 'Error in private archive handler');
    await ctx.answerCbQuery('Error');
  }
};

export const handleAddPrivateChat = async (ctx: Context) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  try {
    const user = await BotUser.findOne({ userId });
    if (!user) return;

    const lang = user.settings.language || 'uz';
    
    await ctx.answerCbQuery();
    
    const infoText = lang === 'uz'
      ? '💡 Bu chatlar uchun maxsus arxiv sozlamalarini belgilaysiz.\n\n⚠️ Default: Barcha chatlar arxivlanadi (media + message).\nFaqat istisno kerak bo\'lgan chatlarni qo\'shing.\n\n👇 Foydalanuvchi tanlang:'
      : lang === 'en'
      ? '💡 Set custom archive settings for these chats.\n\n⚠️ Default: All chats are archived (media + message).\nOnly add chats that need exceptions.\n\n👇 Select a user:'
      : '💡 Установите пользовательские настройки архивации.\n\n⚠️ По умолчанию: Все чаты архивируются (медиа + сообщения).\nДобавляйте только чаты, которым нужны исключения.\n\n👇 Выберите пользователя:';
    
    const buttonText = lang === 'uz'
      ? '👤 Foydalanuvchi tanlash'
      : lang === 'en'
      ? '👤 Select User'
      : '👤 Выбрать пользователя';

    await ctx.reply(infoText, {
      reply_markup: {
        keyboard: [
          [
            {
              text: buttonText,
              request_users: {
                request_id: 1,
                user_is_bot: false,
                max_quantity: 1
              }
            }
          ]
        ],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    });
    
    logger.info({ userId }, 'User selection keyboard displayed');
  } catch (error) {
    logger.error({ error, userId }, 'Error showing user selector');
    await ctx.answerCbQuery('Error');
  }
};

export const handleSelectPrivateChat = async (ctx: Context, chatId: string) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  try {
    const user = await BotUser.findOne({ userId });
    if (!user) return;

    const lang = user.settings.language || 'uz';
    const client = getActiveClient(userId);
    if (!client) return;

    const chatIdNum = Number(chatId);
    
    const entity = await client.getEntity(chatIdNum);
    let title = 'Unknown User';
    
    if ('firstName' in entity) {
      const firstName = entity.firstName || '';
      const lastName = entity.lastName || '';
      title = `${firstName} ${lastName}`.trim() || title;
    }

    await BotUser.findOneAndUpdate(
      { userId },
      {
        $push: {
          privateArchive: {
            chatId: chatIdNum,
            title,
            archiveMedia: true,
            archiveMessages: true,
            addedAt: new Date()
          }
        }
      }
    );

    const message = lang === 'uz'
      ? `✅ "${title}" istisnolar ro'yxatiga qo'shildi!\n\n💡 Default: Xabarlar ✅ | Media ✅\nSozlamalarni o'zgartiring.`
      : lang === 'en'
      ? `✅ "${title}" added to exceptions!\n\n💡 Default: Messages ✅ | Media ✅\nCustomize the settings.`
      : `✅ "${title}" добавлен в исключения!\n\n💡 По умолчанию: Сообщения ✅ | Медиа ✅\nНастройте параметры.`;

    await ctx.answerCbQuery(message);
    await handlePrivateArchive(ctx);
    
    logger.info({ userId, chatId: chatIdNum, title }, 'Private chat added to archive');
  } catch (error) {
    logger.error({ error, userId, chatId }, 'Error selecting private chat');
    await ctx.answerCbQuery('Error');
  }
};

export const handleUsersShared = async (ctx: Context) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  try {
    const message = ctx.message as any;
    if (!message?.users_shared?.users || message.users_shared.users.length === 0) {
      return;
    }

    const sharedUser = message.users_shared.users[0];
    const sharedUserId = sharedUser.user_id;

    const user = await BotUser.findOne({ userId });
    if (!user) return;

    const lang = user.settings.language || 'uz';
    
    const existingChat = user.privateArchive?.find(c => c.chatId === sharedUserId);
    if (existingChat) {
      const alreadyAddedText = lang === 'uz'
        ? `⚠️ Bu foydalanuvchi allaqachon istisnolar ro'yxatida!`
        : lang === 'en'
        ? `⚠️ This user is already in the exceptions list!`
        : `⚠️ Этот пользователь уже в списке исключений!`;
      
      await ctx.reply(alreadyAddedText, {
        reply_markup: { remove_keyboard: true }
      });
      return;
    }

    const client = getActiveClient(userId);
    if (!client) {
      const noClientText = lang === 'uz'
        ? '⚠️ Userbot ulanmagan!'
        : lang === 'en'
        ? '⚠️ Userbot not connected!'
        : '⚠️ Userbot не подключен!';
      
      await ctx.reply(noClientText, {
        reply_markup: { remove_keyboard: true }
      });
      return;
    }

    let title = 'Unknown User';
    try {
      const entity = await client.getEntity(sharedUserId);
      if ('firstName' in entity) {
        const firstName = entity.firstName || '';
        const lastName = entity.lastName || '';
        title = `${firstName} ${lastName}`.trim() || title;
      }
    } catch (err) {
      logger.warn({ userId, sharedUserId, error: err }, 'Could not fetch user entity, using default title');
    }

    await BotUser.findOneAndUpdate(
      { userId },
      {
        $push: {
          privateArchive: {
            chatId: sharedUserId,
            title,
            archiveMedia: true,
            archiveMessages: true,
            addedAt: new Date()
          }
        }
      }
    );

    logger.info({ userId, sharedUserId, title }, 'User added to exceptions via users_shared');
    
    const chats = (await BotUser.findOne({ userId }))?.privateArchive || [];
    
    const menuText = lang === 'uz'
      ? `💬 Arxiv istisnolari\n\n✅ "${title}" qo'shildi!\n\nIstisnolar: ${chats.length} ta chat\n\n💡 Default: Barcha chatlar arxivlanadi.\nBu ro'yxatdagi chatlar uchun maxsus sozlamalar.`
      : lang === 'en'
      ? `💬 Archive Exceptions\n\n✅ "${title}" added!\n\nExceptions: ${chats.length} chats\n\n💡 Default: All chats are archived.\nCustom settings for chats in this list.`
      : `💬 Исключения архива\n\n✅ "${title}" добавлен!\n\nИсключений: ${chats.length} чатов\n\n💡 По умолчанию: Все чаты архивируются.\nПользовательские настройки для чатов в этом списке.`;

    const keyboard = privateArchiveKeyboard(chats, lang);

    await ctx.reply(menuText, keyboard);
  } catch (error) {
    logger.error({ error, userId }, 'Error handling users_shared');
    await ctx.reply('Error adding user to exceptions');
  }
};

export const handlePrivateChatManage = async (ctx: Context, chatId: string) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  try {
    const user = await BotUser.findOne({ userId });
    if (!user) return;

    const lang = user.settings.language || 'uz';
    const chatIdNum = Number(chatId);
    
    const chat = user.privateArchive?.find(c => c.chatId === chatIdNum);
    if (!chat) {
      await ctx.answerCbQuery('Chat not found');
      return;
    }

    const menuText = lang === 'uz'
      ? `⚙️ ${chat.title}\n\nMaxsus arxiv sozlamalari:\n\n💡 O'chirilgan sozlamalar arxivlanmaydi.\nDefault (barcha chatlar) uchun bu chatni ro'yxatdan o'chiring.`
      : lang === 'en'
      ? `⚙️ ${chat.title}\n\nCustom archive settings:\n\n💡 Disabled items won't be archived.\nRemove from list to use default (all chats).`
      : `⚙️ ${chat.title}\n\nПользовательские настройки:\n\n💡 Отключённые элементы не архивируются.\nУдалите из списка для настроек по умолчанию (все чаты).`;

    const keyboard = privateManageKeyboard(chatIdNum, chat.archiveMedia, chat.archiveMessages, lang);

    await ctx.editMessageText(menuText, keyboard);
    await ctx.answerCbQuery();
    
    logger.info({ userId, chatId: chatIdNum }, 'Private chat management displayed');
  } catch (error) {
    logger.error({ error, userId, chatId }, 'Error in private chat management');
    await ctx.answerCbQuery('Error');
  }
};

export const handleTogglePrivateMessages = async (ctx: Context, chatIdStr: string) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  try {
    const user = await BotUser.findOne({ userId });
    if (!user) return;

    const chatIdNum = Number(chatIdStr);
    const chat = user.privateArchive?.find(c => c.chatId === chatIdNum);
    if (!chat) return;

    const newValue = !chat.archiveMessages;

    await BotUser.findOneAndUpdate(
      { userId, 'privateArchive.chatId': chatIdNum },
      { $set: { 'privateArchive.$.archiveMessages': newValue } }
    );

    await ctx.answerCbQuery(newValue ? 'Messages: on' : 'Messages: off');
    await handlePrivateChatManage(ctx, chatIdStr);
    
    logger.info({ userId, chatId: chatIdNum, value: newValue }, 'Private chat messages toggle updated');
  } catch (error) {
    logger.error({ error, userId, chatId: chatIdStr }, 'Error toggling private messages');
    await ctx.answerCbQuery('Error');
  }
};

export const handleTogglePrivateMedia = async (ctx: Context, chatIdStr: string) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  try {
    const user = await BotUser.findOne({ userId });
    if (!user) return;

    const chatIdNum = Number(chatIdStr);
    const chat = user.privateArchive?.find(c => c.chatId === chatIdNum);
    if (!chat) return;

    const newValue = !chat.archiveMedia;

    await BotUser.findOneAndUpdate(
      { userId, 'privateArchive.chatId': chatIdNum },
      { $set: { 'privateArchive.$.archiveMedia': newValue } }
    );

    await ctx.answerCbQuery(newValue ? 'Media: on' : 'Media: off');
    await handlePrivateChatManage(ctx, chatIdStr);
    
    logger.info({ userId, chatId: chatIdNum, value: newValue }, 'Private chat media toggle updated');
  } catch (error) {
    logger.error({ error, userId, chatId: chatIdStr }, 'Error toggling private media');
    await ctx.answerCbQuery('Error');
  }
};

export const handleRemovePrivateChat = async (ctx: Context, chatIdStr: string) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  try {
    const user = await BotUser.findOne({ userId });
    if (!user) return;

    const lang = user.settings.language || 'uz';
    const chatIdNum = Number(chatIdStr);
    
    const chat = user.privateArchive?.find(c => c.chatId === chatIdNum);
    if (!chat) return;

    await BotUser.findOneAndUpdate(
      { userId },
      { $pull: { privateArchive: { chatId: chatIdNum } } }
    );

    const message = lang === 'uz'
      ? `🗑 "${chat.title}" o'chirildi!\n\n💡 Endi bu chat default sozlamalar bilan arxivlanadi (hamma narsa).`
      : lang === 'en'
      ? `🗑 "${chat.title}" removed!\n\n💡 This chat will now use default settings (archive everything).`
      : `🗑 "${chat.title}" удалён!\n\n💡 Теперь этот чат будет использовать настройки по умолчанию (архивировать всё).`;

    await ctx.answerCbQuery(message);
    await handlePrivateArchive(ctx);
    
    logger.info({ userId, chatId: chatIdNum, title: chat.title }, 'Private chat removed from archive');
  } catch (error) {
    logger.error({ error, userId, chatId: chatIdStr }, 'Error removing private chat');
    await ctx.answerCbQuery('Error');
  }
};
