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
      ? `💬 Shaxsiy arxiv\n\n${chats.length > 0 ? `Qo'shilgan: ${chats.length} ta chat` : 'Hali chatlar qo\'shilmagan'}`
      : lang === 'en'
      ? `💬 Private Archive\n\n${chats.length > 0 ? `Added: ${chats.length} chats` : 'No chats added yet'}`
      : `💬 Личный архив\n\n${chats.length > 0 ? `Добавлено: ${chats.length} чатов` : 'Чаты ещё не добавлены'}`;

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
      ? `✅ "${title}" qo'shildi!\n\nArziv avtomatik ishga tushadi.`
      : lang === 'en'
      ? `✅ "${title}" added!\n\nArchive will start automatically.`
      : `✅ "${title}" добавлен!\n\nАрхивация начнётся автоматически.`;

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
      ? `⚙️ ${chat.title}\n\nArziv sozlamalari:`
      : lang === 'en'
      ? `⚙️ ${chat.title}\n\nArchive settings:`
      : `⚙️ ${chat.title}\n\nНастройки архивации:`;

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
      ? `🗑 "${chat.title}" o'chirildi!`
      : lang === 'en'
      ? `🗑 "${chat.title}" removed!`
      : `🗑 "${chat.title}" удалён!`;

    await ctx.answerCbQuery(message);
    await handlePrivateArchive(ctx);
    
    logger.info({ userId, chatId: chatIdNum, title: chat.title }, 'Private chat removed from archive');
  } catch (error) {
    logger.error({ error, userId, chatId: chatIdStr }, 'Error removing private chat');
    await ctx.answerCbQuery('Error');
  }
};
