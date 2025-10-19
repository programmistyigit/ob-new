import fs from 'fs/promises';
import path from 'path';
import { createLogger } from '../../utils/logger';
import { sessionStore } from './sessionStore';

const logger = createLogger('SessionMigration');

const OLD_SESSION_FILE = path.join(process.cwd(), 'src', 'storage', 'sessions', 'session.json');

export const migrateOldSessions = async (): Promise<void> => {
  try {
    const data = await fs.readFile(OLD_SESSION_FILE, 'utf-8');
    const parsed: Record<string, string> = JSON.parse(data);
    
    let migratedCount = 0;
    
    for (const [userIdStr, sessionString] of Object.entries(parsed)) {
      const userId = parseInt(userIdStr, 10);
      
      if (!isNaN(userId)) {
        await sessionStore.set(userId, sessionString);
        migratedCount++;
      }
    }
    
    logger.info({ migratedCount }, 'Sessions migrated from old format');
    
    const backupPath = OLD_SESSION_FILE + '.backup';
    await fs.rename(OLD_SESSION_FILE, backupPath);
    logger.info({ backupPath }, 'Old session file backed up');
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      logger.debug('No old session file found, skipping migration');
    } else {
      logger.warn({ error: error.message }, 'Failed to migrate old sessions');
    }
  }
};
