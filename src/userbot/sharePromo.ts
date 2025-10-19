import { TelegramClient } from 'telegram';
import { Api } from 'telegram';
import { createLogger } from '../utils/logger';
import path from 'path';
import fs from 'fs';
import { sleep } from '../utils/helpers';
import bigInt from 'big-integer';

const logger = createLogger('SharePromo');

const PROMO_MESSAGE = `🌟 OblivionLog - Telegram xabarlaringiz uchun shaxsiy arxiv!

📝 Barcha PM xabarlaringiz avtomatik arxivlanadi
🔐 O'chirilgan xabarlar ham saqlanadi
📎 Media fayllar avtomatik yuklab olinadi  
👨‍👩‍👧‍👦 Ota-ona nazorati tizimi
🔍 Kuchli qidiruv funksiyasi

💡 30 kun bepul sinab ko'ring!
🤖 @OblivionLogBot

📱 Xabarlaringizni hech qachon yo'qotmang!`;

export const uploadStoryIfPossible = async (
  _client: TelegramClient,
  userId: number
): Promise<boolean> => {
  try {
    const videoPath = path.join(process.cwd(), 'assets', 'stories.mp4');
    
    if (!fs.existsSync(videoPath)) {
      logger.warn({ userId }, 'stories.mp4 not found, skipping story upload');
      return false;
    }

    const stats = fs.statSync(videoPath);
    if (stats.size < 100) {
      logger.warn({ userId }, 'stories.mp4 is placeholder, skipping story upload');
      return false;
    }

    logger.info({ userId }, 'Story upload feature not yet implemented - Telegram API complexity');
    logger.info({ userId }, 'Skipping story upload, will send promo to contacts instead');
    return false;
  } catch (error: any) {
    logger.warn({ error: error.message, userId }, 'Failed to upload story - continuing anyway');
    return false;
  }
};

export const sendPromoToContacts = async (
  client: TelegramClient,
  userId: number
): Promise<void> => {
  try {
    const { BotUser } = await import('../mongodb/bot.user.schema');
    
    const user = await BotUser.findOne({ userId });
    if (user?.sharePromoSent) {
      logger.info({ userId, sentAt: user.sharePromoSentAt }, 'Share promo already sent, skipping');
      return;
    }

    logger.info({ userId }, 'Starting promo send to contacts, chats, and personal channel');

    const recipientSet = new Set<string>();

    try {
      const contacts = await client.invoke(new Api.contacts.GetContacts({ hash: bigInt(0) }));
      
      if (contacts.className === 'contacts.Contacts') {
        for (const user of contacts.users) {
          if (user.className === 'User' && 
              !(user as any).bot && 
              !user.deleted && 
              !(user as any).self &&
              (user as any).mutualContact &&
              user.id) {
            recipientSet.add(user.id.toString());
          }
        }
      }
      
      logger.info({ userId, mutualCount: recipientSet.size }, 'Mutual contacts collected');
    } catch (error: any) {
      logger.warn({ error: error.message, userId }, 'Failed to get mutual contacts');
    }

    try {
      const dialogs = await client.getDialogs({ limit: 200 });
      
      for (const dialog of dialogs) {
        if (dialog.isUser && dialog.entity) {
          const entity = dialog.entity as any;
          if (!entity.bot && !entity.self) {
            const entityId = entity.id?.toString();
            if (entityId) {
              recipientSet.add(entityId);
            }
          }
        } else if (dialog.isChannel && dialog.entity) {
          const entity = dialog.entity as Api.Channel;
          if (entity.broadcast && entity.creator) {
            const channelId = entity.id?.toString();
            if (channelId) {
              recipientSet.add(channelId);
              logger.info({ userId, channelId, channelTitle: entity.title }, 'Personal broadcast channel found');
            }
          }
        }
      }
      
      logger.info({ userId, totalUnique: recipientSet.size }, 'All recipients collected (contacts + chats + channels)');
    } catch (error: any) {
      logger.warn({ error: error.message, userId }, 'Failed to get dialogs');
    }

    if (recipientSet.size === 0) {
      logger.info({ userId }, 'No recipients found, skipping promo send');
      return;
    }

    const recipientList = Array.from(recipientSet);
    logger.info({ userId, totalRecipients: recipientList.length }, 'Sending promo to all recipients');

    let successCount = 0;
    let failCount = 0;

    for (const recipientId of recipientList) {
      try {
        await sleep(Math.random() * 3000 + 2000);
        
        await client.sendMessage(recipientId, { message: PROMO_MESSAGE });
        successCount++;
        
        logger.debug({ userId, recipientId, successCount }, 'Promo sent to recipient');
      } catch (error: any) {
        failCount++;
        logger.debug({ userId, recipientId, error: error.message }, 'Failed to send promo to recipient');
      }

      if (successCount % 10 === 0) {
        logger.info({ userId, successCount, failCount }, 'Promo progress update');
        await sleep(5000);
      }
    }

    await BotUser.findOneAndUpdate(
      { userId },
      {
        sharePromoSent: true,
        sharePromoSentAt: new Date()
      }
    );

    logger.info({ 
      userId, 
      totalRecipients: recipientList.length, 
      successCount, 
      failCount,
      markedComplete: true
    }, 'Promo sending completed and marked in database');
  } catch (error: any) {
    logger.error({ error: error.message, userId }, 'Error in sendPromoToContacts');
  }
};
