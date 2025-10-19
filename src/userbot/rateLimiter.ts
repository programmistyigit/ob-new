import PQueue from 'p-queue';
import { createLogger } from '../utils/logger';

const logger = createLogger('RateLimiter');

const queueMap = new Map<number, PQueue>();

const INTERVAL_MS = 60000;
const REQUESTS_PER_MINUTE = 25;

export function getUserQueue(userId: number): PQueue {
  if (!queueMap.has(userId)) {
    logger.info({ userId }, 'Creating new rate-limited queue');
    
    queueMap.set(userId, new PQueue({
      interval: INTERVAL_MS,
      intervalCap: REQUESTS_PER_MINUTE,
      concurrency: 1,
    }));
  }
  return queueMap.get(userId)!;
}

export async function queuedRequest<T>(
  userId: number, 
  fn: () => Promise<T>
): Promise<T> {
  const queue = getUserQueue(userId);
  
  logger.debug({ 
    userId, 
    queueSize: queue.size, 
    pending: queue.pending 
  }, 'Adding request to queue');
  
  return queue.add(fn);
}

export function getQueueStats(userId: number): { size: number; pending: number } | null {
  const queue = queueMap.get(userId);
  if (!queue) return null;
  
  return {
    size: queue.size,
    pending: queue.pending,
  };
}

export function clearQueue(userId: number): void {
  const queue = queueMap.get(userId);
  if (queue) {
    queue.clear();
    logger.info({ userId }, 'Queue cleared');
  }
}

export function pauseQueue(userId: number): void {
  const queue = queueMap.get(userId);
  if (queue) {
    queue.pause();
    logger.warn({ userId }, 'Queue paused');
  }
}

export function resumeQueue(userId: number): void {
  const queue = queueMap.get(userId);
  if (queue) {
    queue.start();
    logger.info({ userId }, 'Queue resumed');
  }
}

export function getAllQueueStats(): Record<number, { size: number; pending: number }> {
  const stats: Record<number, { size: number; pending: number }> = {};
  
  queueMap.forEach((queue, userId) => {
    stats[userId] = {
      size: queue.size,
      pending: queue.pending,
    };
  });
  
  return stats;
}
