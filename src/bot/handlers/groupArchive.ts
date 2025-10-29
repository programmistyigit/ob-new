import { Context } from 'telegraf';
import { BotUser } from '../../mongodb/bot.user.schema';
import { createLogger } from '../../utils/logger';
import { groupArchiveKeyboard, groupManageKeyboard } from '../keyboards';
import { getActiveClient } from '../../userbot/runUserBot';
import { Dialog } from 'telegram/tl/custom/dialog';

const logger = createLogger('GroupArchiveHandler');

export const handleGroupArchive = async (ctx: Context) => {
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
      logger.info({ userId }, 'Group archive access denied - session revoked');
      return;
    }

    const groups = user.groupArchive || [];

    const menuText = lang === 'uz'
      ? `📂 Guruh arxivi\n\n${groups.length > 0 ? `Qo'shilgan: ${groups.length} ta guruh` : 'Hali guruhlar qo\'shilmagan'}`
      : lang === 'en'
      ? `📂 Group Archive\n\n${groups.length > 0 ? `Added: ${groups.length} groups` : 'No groups added yet'}`
      : `📂 Архив групп\n\n${groups.length > 0 ? `Добавлено: ${groups.length} групп` : 'Группы ещё не добавлены'}`;

    const keyboard = groupArchiveKeyboard(groups, lang);

    await ctx.editMessageText(menuText, keyboard);
    await ctx.answerCbQuery();
    
    logger.info({ userId, groupCount: groups.length }, 'Group archive menu displayed');
  } catch (error) {
    logger.error({ error, userId }, 'Error in group archive handler');
    await ctx.answerCbQuery('Error');
  }
};

export const handleAddGroup = async (ctx: Context) => {
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

    await ctx.answerCbQuery(lang === 'uz' ? 'Guruhlar yuklanmoqda...' : lang === 'en' ? 'Loading groups...' : 'Загрузка групп...');

    const dialogs = await client.getDialogs({ limit: 100 });
    
    const groups = dialogs.filter((dialog: Dialog) => {
      if (dialog.isGroup || dialog.isChannel) {
        const existingGroup = user.groupArchive?.find(g => g.chatId === Number(dialog.id));
        return !existingGroup;
      }
      return false;
    });

    if (groups.length === 0) {
      const message = lang === 'uz'
        ? '⚠️ Hamma guruhlar allaqachon qo\'shilgan yoki guruhlar topilmadi.'
        : lang === 'en'
        ? '⚠️ All groups already added or no groups found.'
        : '⚠️ Все группы уже добавлены или группы не найдены.';
      
      await ctx.editMessageText(message, {
        reply_markup: {
          inline_keyboard: [[{ text: lang === 'uz' ? '⬅️ Orqaga' : lang === 'en' ? '⬅️ Back' : '⬅️ Назад', callback_data: 'group_archive' }]]
        }
      });
      return;
    }

    const buttons = groups.slice(0, 20).map((group: Dialog) => {
      const title = group.title || 'Unknown';
      return [{ text: title, callback_data: `ga_select_${group.id}` }];
    });

    buttons.push([{ text: lang === 'uz' ? '⬅️ Orqaga' : lang === 'en' ? '⬅️ Back' : '⬅️ Назад', callback_data: 'group_archive' }]);

    const menuText = lang === 'uz'
      ? `➕ Guruh tanlang:\n\nTopildi: ${groups.length} ta guruh`
      : lang === 'en'
      ? `➕ Select a group:\n\nFound: ${groups.length} groups`
      : `➕ Выберите группу:\n\nНайдено: ${groups.length} групп`;

    await ctx.editMessageText(menuText, { reply_markup: { inline_keyboard: buttons } });
    
    logger.info({ userId, groupsFound: groups.length }, 'Group selection displayed');
  } catch (error) {
    logger.error({ error, userId }, 'Error loading groups');
    await ctx.answerCbQuery('Error');
  }
};

export const handleSelectGroup = async (ctx: Context, chatId: string) => {
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
    let title = 'Unknown Group';
    
    if ('title' in entity) {
      title = entity.title || title;
    }

    await BotUser.findOneAndUpdate(
      { userId },
      {
        $push: {
          groupArchive: {
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
      : `✅ "${title}" добавлена!\n\nАрхивация начнётся автоматически.`;

    await ctx.answerCbQuery(message);
    await handleGroupArchive(ctx);
    
    logger.info({ userId, chatId: chatIdNum, title }, 'Group added to archive');
  } catch (error) {
    logger.error({ error, userId, chatId }, 'Error selecting group');
    await ctx.answerCbQuery('Error');
  }
};

export const handleGroupManage = async (ctx: Context, chatId: string) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  try {
    const user = await BotUser.findOne({ userId });
    if (!user) return;

    const lang = user.settings.language || 'uz';
    const chatIdNum = Number(chatId);
    
    const group = user.groupArchive?.find(g => g.chatId === chatIdNum);
    if (!group) {
      await ctx.answerCbQuery('Group not found');
      return;
    }

    const menuText = lang === 'uz'
      ? `⚙️ ${group.title}\n\nArziv sozlamalari:`
      : lang === 'en'
      ? `⚙️ ${group.title}\n\nArchive settings:`
      : `⚙️ ${group.title}\n\nНастройки архивации:`;

    const keyboard = groupManageKeyboard(chatIdNum, group.archiveMedia, group.archiveMessages, lang);

    await ctx.editMessageText(menuText, keyboard);
    await ctx.answerCbQuery();
    
    logger.info({ userId, chatId: chatIdNum }, 'Group management displayed');
  } catch (error) {
    logger.error({ error, userId, chatId }, 'Error in group management');
    await ctx.answerCbQuery('Error');
  }
};

export const handleToggleGroupMessages = async (ctx: Context, chatIdStr: string) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  try {
    const user = await BotUser.findOne({ userId });
    if (!user) return;

    const chatIdNum = Number(chatIdStr);
    const group = user.groupArchive?.find(g => g.chatId === chatIdNum);
    if (!group) return;

    const newValue = !group.archiveMessages;

    await BotUser.findOneAndUpdate(
      { userId, 'groupArchive.chatId': chatIdNum },
      { $set: { 'groupArchive.$.archiveMessages': newValue } }
    );

    await ctx.answerCbQuery(newValue ? 'Messages: on' : 'Messages: off');
    await handleGroupManage(ctx, chatIdStr);
    
    logger.info({ userId, chatId: chatIdNum, value: newValue }, 'Group messages toggle updated');
  } catch (error) {
    logger.error({ error, userId, chatId: chatIdStr }, 'Error toggling group messages');
    await ctx.answerCbQuery('Error');
  }
};

export const handleToggleGroupMedia = async (ctx: Context, chatIdStr: string) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  try {
    const user = await BotUser.findOne({ userId });
    if (!user) return;

    const chatIdNum = Number(chatIdStr);
    const group = user.groupArchive?.find(g => g.chatId === chatIdNum);
    if (!group) return;

    const newValue = !group.archiveMedia;

    await BotUser.findOneAndUpdate(
      { userId, 'groupArchive.chatId': chatIdNum },
      { $set: { 'groupArchive.$.archiveMedia': newValue } }
    );

    await ctx.answerCbQuery(newValue ? 'Media: on' : 'Media: off');
    await handleGroupManage(ctx, chatIdStr);
    
    logger.info({ userId, chatId: chatIdNum, value: newValue }, 'Group media toggle updated');
  } catch (error) {
    logger.error({ error, userId, chatId: chatIdStr }, 'Error toggling group media');
    await ctx.answerCbQuery('Error');
  }
};

export const handleRemoveGroup = async (ctx: Context, chatIdStr: string) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  try {
    const user = await BotUser.findOne({ userId });
    if (!user) return;

    const lang = user.settings.language || 'uz';
    const chatIdNum = Number(chatIdStr);
    
    const group = user.groupArchive?.find(g => g.chatId === chatIdNum);
    if (!group) return;

    await BotUser.findOneAndUpdate(
      { userId },
      { $pull: { groupArchive: { chatId: chatIdNum } } }
    );

    const message = lang === 'uz'
      ? `🗑 "${group.title}" o'chirildi!`
      : lang === 'en'
      ? `🗑 "${group.title}" removed!`
      : `🗑 "${group.title}" удалена!`;

    await ctx.answerCbQuery(message);
    await handleGroupArchive(ctx);
    
    logger.info({ userId, chatId: chatIdNum, title: group.title }, 'Group removed from archive');
  } catch (error) {
    logger.error({ error, userId, chatId: chatIdStr }, 'Error removing group');
    await ctx.answerCbQuery('Error');
  }
};
