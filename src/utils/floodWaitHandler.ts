import { createLogger } from './logger';

const logger = createLogger('FloodWaitHandler');

export interface FloodWaitError extends Error {
  seconds?: number;
}

export async function handleFloodWait<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  context?: string
): Promise<T | null> {
  let retries = 0;
  
  while (retries < maxRetries) {
    try {
      return await fn();
    } catch (error: any) {
      const errorMessage = error.message || error.toString();
      
      if (errorMessage.includes('FLOOD_WAIT')) {
        const waitMatch = errorMessage.match(/FLOOD_WAIT_(\d+)/);
        if (waitMatch) {
          const waitTime = parseInt(waitMatch[1]);
          const bufferTime = Math.ceil(waitTime * 0.1);
          const totalWait = waitTime + bufferTime;
          
          logger.warn({ 
            waitTime, 
            bufferTime,
            totalWait,
            retries, 
            context,
            maxRetries 
          }, 'FLOOD_WAIT detected, sleeping');
          
          await new Promise(resolve => setTimeout(resolve, totalWait * 1000));
          retries++;
          continue;
        }
      }
      
      if (error.code === 429 || errorMessage.includes('Too Many Requests')) {
        logger.error({ 
          error: errorMessage, 
          context 
        }, 'ERROR 429: IP-level block detected!');
        throw new Error('IP_BLOCKED: Stop all clients immediately!');
      }
      
      throw error;
    }
  }
  
  logger.error({ context, maxRetries }, 'Max retries reached for FLOOD_WAIT');
  return null;
}

export async function safeRequest<T>(
  userId: number,
  fn: () => Promise<T>,
  context?: string
): Promise<T | null> {
  try {
    return await handleFloodWait(fn, 3, context || `user_${userId}`);
  } catch (error: any) {
    if (error.message?.includes('IP_BLOCKED')) {
      logger.error({ userId }, 'Critical: IP blocked, pausing all operations');
      throw error;
    }
    
    logger.error({ 
      userId, 
      error: error.message || error.toString(),
      context 
    }, 'Request failed after flood wait handling');
    
    return null;
  }
}
