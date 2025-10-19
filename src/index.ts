import { createBot } from './bot';
import { runAllUserBots } from './userbot';
import { connectToMongoDB } from './mongodb/connection';
import { createLogger } from './utils/logger';
import { migrateOldSessions } from './userbot/login/migrateSessions';
import { startSubscriptionChecker } from './services/subscriptionChecker';

const logger = createLogger('Main');

async function main() {
  try {
    logger.info('Starting OblivionLog...');

    await connectToMongoDB();
    logger.info('MongoDB connected');

    await migrateOldSessions();
    
    await runAllUserBots();
    logger.info('Userbots started');

    const bot = createBot();
    await bot.launch();
    
    logger.info('Bot launched successfully');

    startSubscriptionChecker();
    logger.info('Subscription checker started');

    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
  } catch (error) {
    logger.error({ error }, 'Failed to start application');
    process.exit(1);
  }
}

main();
