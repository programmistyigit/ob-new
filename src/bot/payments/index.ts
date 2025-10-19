import { Context } from 'telegraf';
import { env } from '../../config/env';
import { BotUser } from '../../mongodb/bot.user.schema';
import { createLogger } from '../../utils/logger';
import { t } from '../i18n';

const logger = createLogger('Payments');

export const createStarsInvoice = async (ctx: Context, userId: number) => {
  if (!env.ENABLE_STARS) {
    await ctx.reply('Payment is currently disabled.');
    return;
  }

  const user = await BotUser.findOne({ userId });
  const lang = user?.settings.language || 'uz';

  try {
    await ctx.replyWithInvoice({
      title: 'OblivionLog Premium',
      description: '30 days of premium access to OblivionLog',
      payload: `user_${userId}_stars`,
      provider_token: '',
      currency: 'XTR',
      prices: [{ label: 'Premium Access', amount: env.STAR_PRICE }],
    });
    
    logger.info({ userId, amount: env.STAR_PRICE }, 'Invoice sent');
  } catch (error) {
    logger.error({ error, userId }, 'Failed to send invoice');
    await ctx.reply(t(lang, 'error'));
  }
};

export const handleSuccessfulPayment = async (ctx: Context) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const user = await BotUser.findOne({ userId });
  const lang = user?.settings.language || 'uz';

  try {
    const now = new Date();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    const result = await BotUser.findOneAndUpdate(
      { userId },
      [
        {
          $set: {
            status: 'active',
            pay: 'stars',
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
      ],
      { 
        upsert: true,
        new: true
      }
    );

    const expiresAt = result?.expiresAt || new Date(now.getTime() + thirtyDaysMs);
    const daysRemaining = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    await ctx.reply(`${t(lang, 'payment_success')}\n\n📅 Muddatingiz: ${daysRemaining} kun`);
    logger.info({ userId, expiresAt, daysRemaining }, 'Payment processed successfully (atomic)');
  } catch (error) {
    logger.error({ error, userId }, 'Failed to process payment');
    await ctx.reply(t(lang, 'error'));
  }
};

export const handlePreCheckoutQuery = async (ctx: Context) => {
  await ctx.answerPreCheckoutQuery(true);
};

export const createMonitoringInvoice = async (ctx: Context, userId: number, childId: number) => {
  if (!env.ENABLE_STARS) {
    await ctx.reply('Payment is currently disabled.');
    return;
  }

  const user = await BotUser.findOne({ userId });
  const lang = user?.settings.language || 'uz';

  try {
    await ctx.replyWithInvoice({
      title: 'Parental Monitoring',
      description: '30 days of child monitoring access',
      payload: `monitoring_${userId}_${childId}`,
      provider_token: '',
      currency: 'XTR',
      prices: [{ label: 'Monitoring Access', amount: 50 }],
    });
    
    logger.info({ userId, childId, amount: 50 }, 'Monitoring invoice sent');
  } catch (error) {
    logger.error({ error, userId, childId }, 'Failed to send monitoring invoice');
    await ctx.reply(t(lang, 'error'));
  }
};

export const handleMonitoringPayment = async (ctx: Context) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const payload = (ctx.message as any)?.successful_payment?.invoice_payload;
  if (!payload || !payload.startsWith('monitoring_')) return;

  const parts = payload.split('_');
  if (parts.length !== 3) return;

  const childId = Number(parts[2]);
  
  const user = await BotUser.findOne({ userId });
  const lang = user?.settings.language || 'uz';

  try {
    const now = new Date();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    await BotUser.findOneAndUpdate(
      { 
        userId,
        'childConnections.childId': childId
      },
      [
        {
          $set: {
            childConnections: {
              $map: {
                input: '$childConnections',
                as: 'conn',
                in: {
                  $cond: {
                    if: { $eq: ['$$conn.childId', childId] },
                    then: {
                      $mergeObjects: [
                        '$$conn',
                        {
                          expiresAt: {
                            $cond: {
                              if: {
                                $and: [
                                  { $ne: ['$$conn.expiresAt', null] },
                                  { $gt: ['$$conn.expiresAt', now] }
                                ]
                              },
                              then: { $add: ['$$conn.expiresAt', thirtyDaysMs] },
                              else: { $add: [now, thirtyDaysMs] }
                            }
                          }
                        }
                      ]
                    },
                    else: '$$conn'
                  }
                }
              }
            }
          }
        }
      ]
    );

    await BotUser.findOneAndUpdate(
      { 
        userId: childId,
        'parentConnections.parentId': userId
      },
      [
        {
          $set: {
            parentConnections: {
              $map: {
                input: '$parentConnections',
                as: 'conn',
                in: {
                  $cond: {
                    if: { $eq: ['$$conn.parentId', userId] },
                    then: {
                      $mergeObjects: [
                        '$$conn',
                        {
                          expiresAt: {
                            $cond: {
                              if: {
                                $and: [
                                  { $ne: ['$$conn.expiresAt', null] },
                                  { $gt: ['$$conn.expiresAt', now] }
                                ]
                              },
                              then: { $add: ['$$conn.expiresAt', thirtyDaysMs] },
                              else: { $add: [now, thirtyDaysMs] }
                            }
                          }
                        }
                      ]
                    },
                    else: '$$conn'
                  }
                }
              }
            }
          }
        }
      ]
    );
    
    await ctx.reply(t(lang, 'monitoring_payment_success'));
    logger.info({ userId, childId }, 'Monitoring payment processed successfully');
  } catch (error) {
    logger.error({ error, userId, childId }, 'Failed to process monitoring payment');
    await ctx.reply(t(lang, 'error'));
  }
};
