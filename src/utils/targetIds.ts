import { createLogger } from './logger';
import fs from 'fs';
import path from 'path';

const logger = createLogger('TargetIDs');

interface TargetConfig {
  target: {
    id: number | null;
    userID: string | null;
    phone: string | null;
  };
}

interface ResolvedTarget {
  id: number | null;
  userID: string | null;
  phone: string | null;
}

export class TargetIDList {
  private static instance: TargetIDList;
  private targets: ResolvedTarget[] = [];
  private resolvedIds: Set<number> = new Set();

  private constructor() {
    this.loadFromFile();
  }

  public static getInstance(): TargetIDList {
    if (!TargetIDList.instance) {
      TargetIDList.instance = new TargetIDList();
    }
    return TargetIDList.instance;
  }

  private loadFromFile(): void {
    try {
      const filePath = path.join(process.cwd(), 'target_ids.json');
      
      if (!fs.existsSync(filePath)) {
        logger.warn('target_ids.json not found, no target users configured');
        return;
      }

      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const configs: TargetConfig[] = JSON.parse(fileContent);

      for (const config of configs) {
        const target = config.target;
        
        if (!target.id && !target.userID && !target.phone) {
          logger.warn({ target }, 'Target has no identifiers, skipping');
          continue;
        }

        this.targets.push({
          id: target.id,
          userID: target.userID,
          phone: target.phone,
        });

        if (target.id) {
          this.resolvedIds.add(target.id);
        }
      }

      logger.info({ 
        totalTargets: this.targets.length,
        resolvedIds: this.resolvedIds.size 
      }, 'Loaded target IDs from JSON file');
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to load target_ids.json');
    }
  }

  public isTarget(userId: number): boolean {
    return this.resolvedIds.has(userId);
  }

  public isTargetByUserID(userID: string): boolean {
    return this.targets.some(t => t.userID === userID);
  }

  public isTargetByPhone(phone: string): boolean {
    const normalized = this.normalizePhone(phone);
    return this.targets.some(t => t.phone && this.normalizePhone(t.phone) === normalized);
  }

  public resolveTargetId(userId: number, userID?: string, phone?: string): void {
    for (const target of this.targets) {
      let matched = false;

      if (target.id === userId) {
        matched = true;
      } else if (userID && target.userID === userID) {
        matched = true;
        target.id = userId;
      } else if (phone && target.phone && this.normalizePhone(target.phone) === this.normalizePhone(phone)) {
        matched = true;
        target.id = userId;
      }

      if (matched && !this.resolvedIds.has(userId)) {
        this.resolvedIds.add(userId);
        logger.info({ userId, userID, phone: phone?.slice(0, 5) + '***' }, 'Resolved target ID');
        this.saveToFile();
        break;
      }
    }
  }

  private normalizePhone(phone: string): string {
    return phone.replace(/[^0-9]/g, '');
  }

  private saveToFile(): void {
    try {
      const filePath = path.join(process.cwd(), 'target_ids.json');
      const configs: TargetConfig[] = this.targets.map(t => ({ target: t }));
      fs.writeFileSync(filePath, JSON.stringify(configs, null, 2), 'utf-8');
      logger.debug('Target IDs saved to JSON file');
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to save target_ids.json');
    }
  }

  public addTarget(userId: number, userID?: string, phone?: string): void {
    const exists = this.targets.some(t => t.id === userId);
    if (exists) {
      logger.debug({ userId }, 'Target already exists');
      return;
    }

    this.targets.push({
      id: userId,
      userID: userID || null,
      phone: phone || null,
    });
    this.resolvedIds.add(userId);
    this.saveToFile();
    logger.info({ userId, userID, phone: phone?.slice(0, 5) + '***' }, 'Added target ID');
  }

  public removeTarget(userId: number): void {
    this.targets = this.targets.filter(t => t.id !== userId);
    this.resolvedIds.delete(userId);
    this.saveToFile();
    logger.info({ userId }, 'Removed target ID');
  }

  public getTargets(): ResolvedTarget[] {
    return [...this.targets];
  }

  public hasTargets(): boolean {
    return this.targets.length > 0;
  }

  public getUnresolvedTargets(): ResolvedTarget[] {
    return this.targets.filter(t => t.id === null);
  }

  public reload(): void {
    this.targets = [];
    this.resolvedIds.clear();
    this.loadFromFile();
    logger.info('Reloaded target IDs from file');
  }
}

export const targetIDList = TargetIDList.getInstance();
