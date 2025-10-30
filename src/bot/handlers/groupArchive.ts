import { Context } from 'telegraf';
import { BotUser } from '../../mongodb/bot.user.schema';
import { createLogger } from '../../utils/logger';
import { groupArchiveKeyboard, groupManageKeyboard } from '../keyboards';
import { getActiveClient } from '../../userbot/runUserBot';

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
    
    await ctx.answerCbQuery();
    
    const infoText = lang === 'uz'
      ? '📂 Guruh arxivi sozlamalari\n\n💡 Qo\'shilgan guruhlarning barcha xabarlari arxivlanadi.\n\n👇 Guruh tanlang:'
      : lang === 'en'
      ? '📂 Group Archive Settings\n\n💡 All messages from added groups will be archived.\n\n👇 Select a group:'
      : '📂 Настройки архива групп\n\n💡 Все сообщения из добавленных групп будут архивироваться.\n\n👇 Выберите группу:';
    
    const buttonText = lang === 'uz'
      ? '👥 Guruh tanlash'
      : lang === 'en'
      ? '👥 Select Group'
      : '👥 Выбрать группу';

    await ctx.reply(infoText, {
      reply_markup: {
        keyboard: [
          [
            {
              text: buttonText,
              request_chat: {
                request_id: 2,
                chat_is_channel: false
              }
            }
          ]
        ],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    });
    
    logger.info({ userId }, 'Group selection keyboard displayed');
  } catch (error) {
    logger.error({ error, userId }, 'Error showing group selector');
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

export const handleChatsShared = async (ctx: Context) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  try {
    const message = ctx.message as any;
    if (!message?.chat_shared?.chat_id) {
      return;
    }

    const sharedChatId = message.chat_shared.chat_id;

    const user = await BotUser.findOne({ userId });
    if (!user) return;

    const lang = user.settings.language || 'uz';
    
    const existingGroup = user.groupArchive?.find(g => g.chatId === sharedChatId);
    if (existingGroup) {
      const alreadyAddedText = lang === 'uz'
        ? `⚠️ Bu guruh allaqachon arxiv ro'yxatida!`
        : lang === 'en'
        ? `⚠️ This group is already in the archive list!`
        : `⚠️ Эта группа уже в списке архива!`;
      
      await ctx.reply(alreadyAddedText);
      return;
    }

    const client = getActiveClient(userId);
    if (!client) {
      const noClientText = lang === 'uz'
        ? '⚠️ Userbot ulanmagan!'
        : lang === 'en'
        ? '⚠️ Userbot not connected!'
        : '⚠️ Userbot не подключен!';
      
      await ctx.reply(noClientText);
      return;
    }

    let title = 'Unknown Group';
    try {
      const entity = await client.getEntity(sharedChatId);
      if ('title' in entity) {
        title = entity.title || title;
      }
    } catch (err) {
      logger.warn({ userId, sharedChatId, error: err }, 'Could not fetch group entity, using default title');
    }

    await BotUser.findOneAndUpdate(
      { userId },
      {
        $push: {
          groupArchive: {
            chatId: sharedChatId,
            title,
            archiveMedia: true,
            archiveMessages: true,
            addedAt: new Date()
          }
        }
      }
    );

    logger.info({ userId, sharedChatId, title }, 'Group added to archive via chat_shared');
    
    const groups = (await BotUser.findOne({ userId }))?.groupArchive || [];
    
    const menuText = lang === 'uz'
      ? `📂 Guruh arxivi\n\n✅ "${title}" qo'shildi!\n\nQo'shilgan: ${groups.length} ta guruh`
      : lang === 'en'
      ? `📂 Group Archive\n\n✅ "${title}" added!\n\nAdded: ${groups.length} groups`
      : `📂 Архив групп\n\n✅ "${title}" добавлена!\n\nДобавлено: ${groups.length} групп`;

    const keyboard = groupArchiveKeyboard(groups, lang);

    await ctx.reply(menuText, keyboard);
  } catch (error) {
    logger.error({ error, userId }, 'Error handling chat_shared');
    await ctx.reply('Error adding group to archive');
  }
};
