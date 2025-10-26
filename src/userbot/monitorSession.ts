import { TelegramClient } from 'telegram';
import { Api } from 'telegram/tl';
import { createLogger } from '../utils/logger';

const logger = createLogger('SessionMonitor');

export interface SessionEndCallback {
  (userId: number, reason: string): Promise<void>;
}

export const monitorSession = async (
  client: TelegramClient,
  userId: number,
  onEnd: SessionEndCallback
): Promise<void> => {
  logger.info({ userId }, 'Monitoring session started');

  const originalInvoke = client.invoke.bind(client);
  
  (client as any).invoke = async function (request: any) {
    try {
      return await originalInvoke(request);
    } catch (error: any) {
      const errorMsg = error.errorMessage || error.message || '';
      
      if (errorMsg.includes('AUTH_KEY_UNREGISTERED') || 
          errorMsg.includes('SESSION_REVOKED') || 
          errorMsg.includes('USER_DEACTIVATED') ||
          errorMsg.includes('AUTH_KEY_DUPLICATED')) {
        logger.error({ userId, error: errorMsg }, 'Session invalidated - terminating');
        await onEnd(userId, errorMsg);
        throw error;
      }
      
      if (request instanceof Api.auth.LogOut) {
        logger.info({ userId }, 'User logged out');
        await onEnd(userId, 'LOGGED_OUT');
      }
      
      throw error;
    }
  };
};
