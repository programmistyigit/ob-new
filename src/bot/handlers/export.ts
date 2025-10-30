import { Context } from 'telegraf';
import { BotUser } from '../../mongodb/bot.user.schema';
import { Archive } from '../../mongodb/archive.schema';
import { createLogger } from '../../utils/logger';
import { getActiveClient } from '../../userbot/runUserBot';
import * as fs from 'fs';
import * as path from 'path';

const logger = createLogger('ExportHandler');

export const handleExportMenu = async (ctx: Context) => {
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
      logger.info({ userId }, 'Export menu access denied - session revoked');
      return;
    }

    // Get list of users with archived messages
    const archivedUsers = await Archive.aggregate([
      { $match: { user_id: userId } },
      { $group: { _id: '$other_id', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    if (archivedUsers.length === 0) {
      const message = lang === 'uz'
        ? '⚠️ Hali arxivlangan xabarlar yo\'q!'
        : lang === 'en'
        ? '⚠️ No archived messages yet!'
        : '⚠️ Пока нет архивированных сообщений!';
      
      await ctx.editMessageText(message, {
        reply_markup: {
          inline_keyboard: [[{ text: lang === 'uz' ? '⬅️ Orqaga' : lang === 'en' ? '⬅️ Back' : '⬅️ Назад', callback_data: 'settings_back' }]]
        }
      });
      await ctx.answerCbQuery();
      return;
    }

    const menuText = lang === 'uz'
      ? `📤 Export\n\nAr​xivdan ma'lumotlarni eksport qiling.\n\n💡 ${archivedUsers.length} ta foydalanuvchi bilan arxivlangan xabarlar mavjud.\n\n👇 Foydalanuvchi tanlang:`
      : lang === 'en'
      ? `📤 Export\n\nExport data from your archive.\n\n💡 You have archived messages with ${archivedUsers.length} users.\n\n👇 Select a user:`
      : `📤 Экспорт\n\nЭкспортируйте данные из архива.\n\n💡 У вас есть архивированные сообщения с ${archivedUsers.length} пользователями.\n\n👇 Выберите пользователя:`;

    const buttons: any[][] = [];
    
    // Get user details for each archived user
    const client = getActiveClient(userId);

    for (const archived of archivedUsers.slice(0, 15)) {
      let userName = `User ${archived._id}`;
      
      if (client) {
        try {
          const entity = await client.getEntity(archived._id);
          if ('firstName' in entity) {
            const firstName = entity.firstName || '';
            const lastName = entity.lastName || '';
            userName = `${firstName} ${lastName}`.trim() || userName;
          }
        } catch (err) {
          logger.warn({ userId, otherId: archived._id }, 'Could not fetch user entity');
        }
      }

      buttons.push([{ 
        text: `${userName} (${archived.count} ta xabar)`, 
        callback_data: `export_user_${archived._id}` 
      }]);
    }

    buttons.push([{ 
      text: lang === 'uz' ? '⬅️ Orqaga' : lang === 'en' ? '⬅️ Back' : '⬅️ Назад', 
      callback_data: 'settings_back' 
    }]);

    await ctx.editMessageText(menuText, {
      reply_markup: { inline_keyboard: buttons }
    });
    await ctx.answerCbQuery();
    
    logger.info({ userId, userCount: archivedUsers.length }, 'Export menu displayed');
  } catch (error) {
    logger.error({ error, userId }, 'Error in export menu handler');
    await ctx.answerCbQuery('Error');
  }
};

export const handleSelectUserForExport = async (ctx: Context, otherId: string) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  try {
    const user = await BotUser.findOne({ userId });
    if (!user) return;

    const lang = user.settings.language || 'uz';
    const otherIdNum = Number(otherId);

    // Get message count
    const messageCount = await Archive.countDocuments({ 
      user_id: userId, 
      other_id: otherIdNum 
    });

    // Get user name
    const client = getActiveClient(userId);
    let userName = `User ${otherIdNum}`;
    if (client) {
      try {
        const entity = await client.getEntity(otherIdNum);
        if ('firstName' in entity) {
          const firstName = entity.firstName || '';
          const lastName = entity.lastName || '';
          userName = `${firstName} ${lastName}`.trim() || userName;
        }
      } catch (err) {
        logger.warn({ userId, otherId: otherIdNum }, 'Could not fetch user entity');
      }
    }

    const menuText = lang === 'uz'
      ? `📤 Export: ${userName}\n\n💬 Jami: ${messageCount} ta xabar\n\n📑 Format tanlang:`
      : lang === 'en'
      ? `📤 Export: ${userName}\n\n💬 Total: ${messageCount} messages\n\n📑 Select format:`
      : `📤 Экспорт: ${userName}\n\n💬 Всего: ${messageCount} сообщений\n\n📑 Выберите формат:`;

    const jsonText = lang === 'uz'
      ? '📄 JSON'
      : lang === 'en'
      ? '📄 JSON'
      : '📄 JSON';

    const textText = lang === 'uz'
      ? '📝 TEXT'
      : lang === 'en'
      ? '📝 TEXT'
      : '📝 TEXT';

    const pdfText = lang === 'uz'
      ? '📕 PDF'
      : lang === 'en'
      ? '📕 PDF'
      : '📕 PDF';

    await ctx.editMessageText(menuText, {
      reply_markup: {
        inline_keyboard: [
          [{ text: jsonText, callback_data: `export_format_json_${otherIdNum}` }],
          [{ text: textText, callback_data: `export_format_text_${otherIdNum}` }],
          [{ text: pdfText, callback_data: `export_format_pdf_${otherIdNum}` }],
          [{ text: lang === 'uz' ? '⬅️ Orqaga' : lang === 'en' ? '⬅️ Back' : '⬅️ Назад', callback_data: 'export_menu' }]
        ]
      }
    });
    await ctx.answerCbQuery();
    
    logger.info({ userId, otherId: otherIdNum, messageCount }, 'Export user selected');
  } catch (error) {
    logger.error({ error, userId, otherId }, 'Error in select user for export');
    await ctx.answerCbQuery('Error');
  }
};

export const handleExportJSON = async (ctx: Context, otherId: string) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  try {
    const user = await BotUser.findOne({ userId });
    if (!user) return;

    const lang = user.settings.language || 'uz';
    const otherIdNum = Number(otherId);

    await ctx.answerCbQuery(lang === 'uz' ? 'Eksport qilinmoqda...' : lang === 'en' ? 'Exporting...' : 'Экспорт...');

    // Get all messages
    const messages = await Archive.find({ 
      user_id: userId, 
      other_id: otherIdNum 
    }).sort({ date: 1 }).lean();

    if (messages.length === 0) {
      await ctx.reply(lang === 'uz' ? '⚠️ Xabarlar topilmadi!' : lang === 'en' ? '⚠️ No messages found!' : '⚠️ Сообщения не найдены!');
      return;
    }

    // Get user name
    const client = getActiveClient(userId);
    let userName = `User ${otherIdNum}`;
    if (client) {
      try {
        const entity = await client.getEntity(otherIdNum);
        if ('firstName' in entity) {
          const firstName = entity.firstName || '';
          const lastName = entity.lastName || '';
          userName = `${firstName} ${lastName}`.trim() || userName;
        }
      } catch (err) {
        logger.warn({ userId, otherId: otherIdNum }, 'Could not fetch user entity for export');
      }
    }

    // Create JSON export
    const exportData = {
      export_info: {
        user_id: userId,
        contact_id: otherIdNum,
        contact_name: userName,
        total_messages: messages.length,
        export_date: new Date().toISOString(),
        date_range: {
          first_message: messages[0].date,
          last_message: messages[messages.length - 1].date
        }
      },
      messages: messages.map(msg => ({
        message_id: msg.message_id,
        direction: msg.direction,
        text: msg.text || null,
        date: msg.date,
        forwarded: msg.forwarded,
        media: msg.media ? {
          fileName: msg.media.fileName || null,
          size: msg.media.size || null,
          mimeType: msg.media.mimeType || null,
          ephemeral: msg.media.ephemeral || false,
          localPath: msg.media.localPath || null
        } : null,
        created_at: msg.created_at
      }))
    };

    const jsonString = JSON.stringify(exportData, null, 2);
    const fileName = `archive_${userName.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.json`;
    const tempDir = path.join(process.cwd(), 'temp');
    
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const filePath = path.join(tempDir, fileName);
    fs.writeFileSync(filePath, jsonString, 'utf8');

    await ctx.replyWithDocument(
      { source: filePath, filename: fileName },
      { caption: lang === 'uz' ? `📄 JSON eksport tayyor!\n\n👤 ${userName}\n💬 ${messages.length} ta xabar` : lang === 'en' ? `📄 JSON export ready!\n\n👤 ${userName}\n💬 ${messages.length} messages` : `📄 JSON экспорт готов!\n\n👤 ${userName}\n💬 ${messages.length} сообщений` }
    );

    // Clean up temp file
    fs.unlinkSync(filePath);

    logger.info({ userId, otherId: otherIdNum, messageCount: messages.length, format: 'JSON' }, 'Export completed');
  } catch (error) {
    logger.error({ error, userId, otherId }, 'Error exporting to JSON');
    await ctx.reply('Error exporting data');
  }
};

export const handleExportTEXT = async (ctx: Context, otherId: string) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  try {
    const user = await BotUser.findOne({ userId });
    if (!user) return;

    const lang = user.settings.language || 'uz';
    const otherIdNum = Number(otherId);

    await ctx.answerCbQuery(lang === 'uz' ? 'Eksport qilinmoqda...' : lang === 'en' ? 'Exporting...' : 'Экспорт...');

    // Get all messages
    const messages = await Archive.find({ 
      user_id: userId, 
      other_id: otherIdNum 
    }).sort({ date: 1 }).lean();

    if (messages.length === 0) {
      await ctx.reply(lang === 'uz' ? '⚠️ Xabarlar topilmadi!' : lang === 'en' ? '⚠️ No messages found!' : '⚠️ Сообщения не найдены!');
      return;
    }

    // Get user name
    const client = getActiveClient(userId);
    let userName = `User ${otherIdNum}`;
    if (client) {
      try {
        const entity = await client.getEntity(otherIdNum);
        if ('firstName' in entity) {
          const firstName = entity.firstName || '';
          const lastName = entity.lastName || '';
          userName = `${firstName} ${lastName}`.trim() || userName;
        }
      } catch (err) {
        logger.warn({ userId, otherId: otherIdNum }, 'Could not fetch user entity for export');
      }
    }

    // Create TEXT export
    let textContent = `ARXIV EKSPORT\n`;
    textContent += `=`.repeat(60) + `\n\n`;
    textContent += `Foydalanuvchi: ${userName}\n`;
    textContent += `Jami xabarlar: ${messages.length}\n`;
    textContent += `Eksport sanasi: ${new Date().toLocaleString()}\n`;
    textContent += `=`.repeat(60) + `\n\n`;

    messages.forEach((msg, index) => {
      const date = new Date(msg.date).toLocaleString();
      const direction = msg.direction === 'me->other' ? '→' : '←';
      
      textContent += `[${index + 1}] ${direction} ${date}\n`;
      
      if (msg.text) {
        textContent += `${msg.text}\n`;
      }
      
      if (msg.media) {
        textContent += `📎 Media: ${msg.media.fileName || 'Unknown'} (${msg.media.mimeType || 'Unknown type'})`;
        if (msg.media.ephemeral) {
          textContent += ` [EPHEMERAL]`;
        }
        textContent += `\n`;
      }
      
      textContent += `\n`;
    });

    const fileName = `archive_${userName.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.txt`;
    const tempDir = path.join(process.cwd(), 'temp');
    
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const filePath = path.join(tempDir, fileName);
    fs.writeFileSync(filePath, textContent, 'utf8');

    await ctx.replyWithDocument(
      { source: filePath, filename: fileName },
      { caption: lang === 'uz' ? `📝 TEXT eksport tayyor!\n\n👤 ${userName}\n💬 ${messages.length} ta xabar` : lang === 'en' ? `📝 TEXT export ready!\n\n👤 ${userName}\n💬 ${messages.length} messages` : `📝 TEXT экспорт готов!\n\n👤 ${userName}\n💬 ${messages.length} сообщений` }
    );

    // Clean up temp file
    fs.unlinkSync(filePath);

    logger.info({ userId, otherId: otherIdNum, messageCount: messages.length, format: 'TEXT' }, 'Export completed');
  } catch (error) {
    logger.error({ error, userId, otherId }, 'Error exporting to TEXT');
    await ctx.reply('Error exporting data');
  }
};

export const handleExportPDF = async (ctx: Context, otherId: string) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  try {
    const user = await BotUser.findOne({ userId });
    if (!user) return;

    const lang = user.settings.language || 'uz';

    await ctx.answerCbQuery(lang === 'uz' ? 'PDF eksport hozircha mavjud emas' : lang === 'en' ? 'PDF export not yet available' : 'PDF экспорт пока недоступен');
    
    const message = lang === 'uz'
      ? '⚠️ PDF eksport hozircha ishlab chiqilmoqda.\n\nIltimos, JSON yoki TEXT formatidan foydalaning.'
      : lang === 'en'
      ? '⚠️ PDF export is under development.\n\nPlease use JSON or TEXT format.'
      : '⚠️ PDF экспорт находится в разработке.\n\nПожалуйста, используйте формат JSON или TEXT.';
    
    await ctx.reply(message);
    
    logger.info({ userId, otherId }, 'PDF export requested but not yet implemented');
  } catch (error) {
    logger.error({ error, userId, otherId }, 'Error in PDF export handler');
    await ctx.reply('Error');
  }
};
