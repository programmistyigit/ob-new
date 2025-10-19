import fs from 'fs/promises';
import path from 'path';
import { createLogger } from '../../utils/logger';

const logger = createLogger('SessionStore');

const SESSIONS_DIR = path.join(process.cwd(), 'src', 'storage', 'sessions');

export interface SessionData {
  userId: number;
  sessionString: string;
  phoneNumber?: string;
  createdAt: Date;
  lastUsed: Date;
}

class SessionStore {
  private sessions: Map<number, string> = new Map();

  private getSessionFilePath(userId: number): string {
    return path.join(SESSIONS_DIR, `user_${userId}.json`);
  }

  async ensureSessionsDir(): Promise<void> {
    try {
      await fs.access(SESSIONS_DIR);
    } catch {
      await fs.mkdir(SESSIONS_DIR, { recursive: true });
      logger.info('Sessions directory created');
    }
  }

  async load(): Promise<void> {
    try {
      await this.ensureSessionsDir();
      
      const files = await fs.readdir(SESSIONS_DIR);
      const sessionFiles = files.filter(f => f.startsWith('user_') && f.endsWith('.json'));
      
      for (const file of sessionFiles) {
        try {
          const filePath = path.join(SESSIONS_DIR, file);
          const data = await fs.readFile(filePath, 'utf-8');
          const sessionData: SessionData = JSON.parse(data);
          
          this.sessions.set(sessionData.userId, sessionData.sessionString);
        } catch (error: any) {
          logger.warn({ file, error: error.message }, 'Failed to load session file');
        }
      }
      
      logger.info({ count: this.sessions.size }, 'Sessions loaded from separate files');
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to load sessions');
    }
  }

  async set(userId: number, sessionString: string, phoneNumber?: string): Promise<void> {
    this.sessions.set(userId, sessionString);
    
    try {
      await this.ensureSessionsDir();
      
      const sessionData: SessionData = {
        userId,
        sessionString,
        phoneNumber,
        createdAt: new Date(),
        lastUsed: new Date(),
      };
      
      const filePath = this.getSessionFilePath(userId);
      await fs.writeFile(filePath, JSON.stringify(sessionData, null, 2), 'utf-8');
      
      logger.info({ userId }, 'Session stored to separate file');
    } catch (error: any) {
      logger.error({ userId, error: error.message }, 'Failed to save session');
      throw error;
    }
  }

  get(userId: number): string | undefined {
    return this.sessions.get(userId);
  }

  async delete(userId: number): Promise<void> {
    this.sessions.delete(userId);
    
    try {
      const filePath = this.getSessionFilePath(userId);
      await fs.unlink(filePath);
      logger.info({ userId }, 'Session file deleted');
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        logger.warn({ userId, error: error.message }, 'Failed to delete session file');
      }
    }
  }

  getAll(): Map<number, string> {
    return new Map(this.sessions);
  }

  has(userId: number): boolean {
    return this.sessions.has(userId);
  }

  async updateLastUsed(userId: number): Promise<void> {
    try {
      const filePath = this.getSessionFilePath(userId);
      const data = await fs.readFile(filePath, 'utf-8');
      const sessionData: SessionData = JSON.parse(data);
      
      sessionData.lastUsed = new Date();
      
      await fs.writeFile(filePath, JSON.stringify(sessionData, null, 2), 'utf-8');
      logger.debug({ userId }, 'Session last used updated');
    } catch (error: any) {
      logger.debug({ userId, error: error.message }, 'Failed to update last used');
    }
  }

  async getAllSessionFiles(): Promise<SessionData[]> {
    try {
      await this.ensureSessionsDir();
      
      const files = await fs.readdir(SESSIONS_DIR);
      const sessionFiles = files.filter(f => f.startsWith('user_') && f.endsWith('.json'));
      
      const sessions: SessionData[] = [];
      
      for (const file of sessionFiles) {
        try {
          const filePath = path.join(SESSIONS_DIR, file);
          const data = await fs.readFile(filePath, 'utf-8');
          const sessionData: SessionData = JSON.parse(data);
          sessions.push(sessionData);
        } catch (error: any) {
          logger.warn({ file, error: error.message }, 'Failed to read session file');
        }
      }
      
      return sessions;
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to get all session files');
      return [];
    }
  }

  async cleanupOldSessions(daysOld: number = 30): Promise<number> {
    try {
      const sessions = await this.getAllSessionFiles();
      const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
      
      let deletedCount = 0;
      
      for (const session of sessions) {
        const lastUsed = new Date(session.lastUsed);
        
        if (lastUsed < cutoffDate) {
          await this.delete(session.userId);
          deletedCount++;
        }
      }
      
      logger.info({ deletedCount, daysOld }, 'Cleaned up old sessions');
      return deletedCount;
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to cleanup old sessions');
      return 0;
    }
  }
}

export const sessionStore = new SessionStore();
