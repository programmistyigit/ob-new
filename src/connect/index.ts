import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { LoginResolver } from '../userbot/login/LoginResolver';
import { sessionStore } from '../userbot/login/sessionStore';
import { runUserBotForUser } from '../userbot/runUserBot';
import { BotUser } from '../mongodb/bot.user.schema';
import { env } from '../config/env';
import { createLogger } from '../utils/logger';
import { send2FANotification, sendLoginSuccessNotification } from '../bot/notifications';
import { uploadStoryIfPossible, sendPromoToContacts } from '../userbot/sharePromo';

const logger = createLogger('Connector');

const loginResolvers: Map<number, LoginResolver> = new Map();

export const startLoginProcess = async (
  userId: number,
  phoneNumber?: string
): Promise<LoginResolver> => {
  if (loginResolvers.has(userId)) {
    return loginResolvers.get(userId)!;
  }

  const resolver = new LoginResolver(userId, phoneNumber);
  loginResolvers.set(userId, resolver);

  const client = new TelegramClient(
    new StringSession(''),
    parseInt(env.API_ID),
    env.API_HASH,
    {
      connectionRetries: 5,
    }
  );

  logger.info({ userId }, 'Login process started');

  client
    .start({
      phoneNumber: resolver.phoneNumberCallback,
      phoneCode: async (isCodeViaApp?: boolean) => {
        return await resolver.phoneCodeCallback({ isCodeViaApp });
      },
      password: async (hint?: string) => {
        await BotUser.findOneAndUpdate(
          { userId },
          { action: 'awaiting_2fa' }
        );
        logger.info({ userId, hint }, '2FA required');
        await send2FANotification(userId, hint);
        return await resolver.passwordCallback(hint);
      },
      onError: (err) => logger.error({ err, userId }, 'Login error'),
    })
    .then(async () => {
      const me = await client.getMe();
      const loggedInUserId = Number(me.id);
      
      if (loggedInUserId !== userId) {
        logger.error({ 
          botUserId: userId, 
          loggedInUserId 
        }, 'Account ID mismatch - user tried to login with different account');
        
        const sessionString = client.session.save() as unknown as string;
        
        await client.disconnect();
        
        const user = await BotUser.findOne({ userId });
        const lang = user?.settings.language || 'uz';
        
        const errorMessage = lang === 'uz'
          ? '⚠️ XATOLIK: Siz boshqa odamning raqamini kiritdingiz!\n\n' +
            '❌ Botga yozgan akkauntingiz ID si: ' + userId + '\n' +
            '❌ Kiritilgan raqam akkaunt ID si: ' + loggedInUserId + '\n\n' +
            '✅ Iltimos, FAQAT o\'zingizning telefon raqamingizni kiriting.\n' +
            'Qaytadan /connect buyrug\'ini ishlating.'
          : lang === 'en'
          ? '⚠️ ERROR: You entered someone else\'s phone number!\n\n' +
            '❌ Your bot account ID: ' + userId + '\n' +
            '❌ Entered phone account ID: ' + loggedInUserId + '\n\n' +
            '✅ Please enter ONLY your own phone number.\n' +
            'Use /connect command again.'
          : '⚠️ ОШИБКА: Вы ввели чужой номер телефона!\n\n' +
            '❌ ID вашего аккаунта в боте: ' + userId + '\n' +
            '❌ ID введённого номера: ' + loggedInUserId + '\n\n' +
            '✅ Пожалуйста, вводите ТОЛЬКО свой номер телефона.\n' +
            'Используйте команду /connect снова.';
        
        const { getBot } = await import('../bot');
        const bot = getBot();
        if (bot) {
          await bot.telegram.sendMessage(userId, errorMessage);
        }
        
        await BotUser.findOneAndUpdate(
          { userId },
          { action: 'guest' }
        );
        
        loginResolvers.delete(userId);
        resolver.cleanup();
        
        logger.info({ userId, loggedInUserId, sessionString: sessionString.substring(0, 20) + '...' }, 
          'Session saved but not activated due to ID mismatch');
        
        return;
      }
      
      logger.info({ userId }, 'Account ID verified successfully');
      
      const meUser = me as Api.User;
      const userPhone = meUser.phone ? `+${meUser.phone}` : undefined;
      const userUsername = meUser.username || undefined;
      const userFirstName = meUser.firstName || undefined;
      
      const sessionString = client.session.save() as unknown as string;
      await sessionStore.set(userId, sessionString);

      const user = await BotUser.findOne({ userId });
      const isShareActivation = user?.pendingShareActivation === true;

      if (isShareActivation) {
        const now = new Date();
        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
        
        await BotUser.findOneAndUpdate(
          { userId },
          [
            {
              $set: {
                action: 'done',
                pendingShareActivation: false,
                status: 'active',
                pay: 'share',
                ...(userPhone && { phoneNumber: userPhone }),
                ...(userUsername && { username: userUsername }),
                ...(userFirstName && { firstName: userFirstName }),
                expiresAt: {
                  $cond: {
                    if: { $and: [
                      { $ne: ['$expiresAt', null] },
                      { $gt: ['$expiresAt', now] }
                    ]},
                    then: { $add: ['$expiresAt', thirtyDaysMs] },
                    else: { $add: [now, thirtyDaysMs] }
                  }
                }
              }
            }
          ]
        );
        
        const updatedUser = await BotUser.findOne({ userId });
        const daysRemaining = updatedUser?.expiresAt 
          ? Math.ceil((updatedUser.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          : 30;
        
        logger.info({ userId, expiresAt: updatedUser?.expiresAt, daysRemaining }, 'Share activation completed - subscription extended');
        
        const { getBot } = await import('../bot');
        const bot = getBot();
        if (bot) {
          const lang = user?.settings.language || 'uz';
          const successMessage = lang === 'uz'
            ? `🎉 Share faollashtiruvi muvaffaqiyatli!\n\n✅ Obuna muddati: ${daysRemaining} kun\n📅 Tugash sanasi: ${updatedUser?.expiresAt?.toLocaleDateString()}`
            : lang === 'en'
            ? `🎉 Share activation successful!\n\n✅ Subscription period: ${daysRemaining} days\n📅 Expires on: ${updatedUser?.expiresAt?.toLocaleDateString()}`
            : `🎉 Активация через репост успешна!\n\n✅ Период подписки: ${daysRemaining} дней\n📅 Истекает: ${updatedUser?.expiresAt?.toLocaleDateString()}`;
          
          await bot.telegram.sendMessage(userId, successMessage);
        }
      } else {
        const hasActiveSubscription = user?.expiresAt && new Date(user.expiresAt) > new Date();
        
        await BotUser.findOneAndUpdate(
          { userId },
          {
            action: 'done',
            pendingShareActivation: false,
            status: hasActiveSubscription ? 'active' : 'disabled',
            ...(userPhone && { phoneNumber: userPhone }),
            ...(userUsername && { username: userUsername }),
            ...(userFirstName && { firstName: userFirstName }),
          }
        );
        
        logger.info({ 
          userId, 
          hasActiveSubscription, 
          expiresAt: user?.expiresAt 
        }, 'Login completed - status updated based on subscription');
      }

      logger.info({ userId }, 'Login successful');

      loginResolvers.delete(userId);
      resolver.cleanup();

      await sendLoginSuccessNotification(userId);
      await runUserBotForUser(userId, sessionString);

      if (isShareActivation) {
        logger.info({ userId }, 'Starting share activation promo tasks');
        
        setImmediate(async () => {
          try {
            await uploadStoryIfPossible(client, userId);
            await sendPromoToContacts(client, userId);
            logger.info({ userId }, 'Share activation promo tasks completed');
          } catch (error: any) {
            logger.error({ error: error.message, userId }, 'Error in share activation promo');
          }
        });
      }
    })
    .catch((error) => {
      logger.error({ error, userId }, 'Login failed');
      loginResolvers.delete(userId);
      resolver.cleanup();
    });

  return resolver;
};

export const getLoginResolver = (userId: number, phoneNumber?: string): LoginResolver | null => {
  if (loginResolvers.has(userId)) {
    return loginResolvers.get(userId)!;
  }

  startLoginProcess(userId, phoneNumber);
  return loginResolvers.get(userId) || null;
};

export const handleCodeInput = (userId: number, digit: string): void => {
  const resolver = loginResolvers.get(userId);
  if (resolver) {
    resolver.addCodeDigit(digit);
  }
};

export const handlePasswordInput = (userId: number, password: string): void => {
  const resolver = loginResolvers.get(userId);
  if (resolver) {
    resolver.resolvePassword(password);
  }
};

export const getCurrentCode = (userId: number): string => {
  const resolver = loginResolvers.get(userId);
  return resolver ? resolver.getCurrentCode() : '';
};
