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
      if (error.errorMessage === 'AUTH_KEY_UNREGISTERED') {
        logger.error({ userId }, 'Auth key unregistered - session ended');
        await onEnd(userId, 'AUTH_KEY_UNREGISTERED');
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
