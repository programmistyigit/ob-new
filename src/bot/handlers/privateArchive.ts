import { Context } from 'telegraf';
import { BotUser } from '../../mongodb/bot.user.schema';
import { createLogger } from '../../utils/logger';
import { privateArchiveKeyboard, privateManageKeyboard } from '../keyboards';
import { getActiveClient } from '../../userbot/runUserBot';
import { Dialog } from 'telegram/tl/custom/dialog';

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
    
    const client = getActiveClient(userId);
    if (!client) {
      const message = lang === 'uz'
        ? '⚠️ Userbot ulanmagan!'
        : lang === 'en'
        ? '⚠️ Userbot not connected!'
        : '⚠️ Userbot не подключен!';
      
      await ctx.answerCbQuery(message);
      return;
    }

    await ctx.answerCbQuery(lang === 'uz' ? 'Chatlar yuklanmoqda...' : lang === 'en' ? 'Loading chats...' : 'Загрузка чатов...');
    
    const infoText = lang === 'uz'
      ? '💡 Bu chatlar uchun maxsus arxiv sozlamalarini belgilaysiz.\n\n⚠️ Default: Barcha chatlar arxivlanadi (media + message).\nFaqat istisno kerak bo\'lgan chatlarni qo\'shing.'
      : lang === 'en'
      ? '💡 Set custom archive settings for these chats.\n\n⚠️ Default: All chats are archived (media + message).\nOnly add chats that need exceptions.'
      : '💡 Установите пользовательские настройки архивации.\n\n⚠️ По умолчанию: Все чаты архивируются (медиа + сообщения).\nДобавляйте только чаты, которым нужны исключения.';
    
    await ctx.reply(infoText);

    const dialogs = await client.getDialogs({ limit: 100 });
    
    const privateChats = dialogs.filter((dialog: Dialog) => {
      if (dialog.isUser && !dialog.entity.bot) {
        const existingChat = user.privateArchive?.find(c => c.chatId === Number(dialog.id));
        return !existingChat;
      }
      return false;
    });

    if (privateChats.length === 0) {
      const message = lang === 'uz'
        ? '⚠️ Hamma chatlar allaqachon qo\'shilgan yoki chatlar topilmadi.'
        : lang === 'en'
        ? '⚠️ All chats already added or no chats found.'
        : '⚠️ Все чаты уже добавлены или чаты не найдены.';
      
      await ctx.editMessageText(message, {
        reply_markup: {
          inline_keyboard: [[{ text: lang === 'uz' ? '⬅️ Orqaga' : lang === 'en' ? '⬅️ Back' : '⬅️ Назад', callback_data: 'private_archive' }]]
        }
      });
      return;
    }

    const buttons = privateChats.slice(0, 20).map((chat: Dialog) => {
      const name = chat.name || chat.title || 'Unknown';
      return [{ text: name, callback_data: `pa_select_${chat.id}` }];
    });

    buttons.push([{ text: lang === 'uz' ? '⬅️ Orqaga' : lang === 'en' ? '⬅️ Back' : '⬅️ Назад', callback_data: 'private_archive' }]);

    const menuText = lang === 'uz'
      ? `➕ Chat tanlang:\n\nTopildi: ${privateChats.length} ta chat`
      : lang === 'en'
      ? `➕ Select a chat:\n\nFound: ${privateChats.length} chats`
      : `➕ Выберите чат:\n\nНайдено: ${privateChats.length} чатов`;

    await ctx.editMessageText(menuText, { reply_markup: { inline_keyboard: buttons } });
    
    logger.info({ userId, chatsFound: privateChats.length }, 'Private chat selection displayed');
  } catch (error) {
    logger.error({ error, userId }, 'Error loading private chats');
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
