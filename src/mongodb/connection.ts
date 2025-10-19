import mongoose from 'mongoose';
import { env } from '../config/env';
import { createLogger } from '../utils/logger';

const logger = createLogger('MongoDB');

export const connectToMongoDB = async (): Promise<void> => {
  try {
    await mongoose.connect(env.MONGO_URI);
    logger.info({ uri: env.MONGO_URI.replace(/\/\/.*@/, '//***@') }, 'MongoDB connected successfully');
  } catch (error) {
    logger.error({ error }, 'MongoDB connection failed');
    throw error;
  }
};

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected');
});

mongoose.connection.on('error', (error) => {
  logger.error({ error }, 'MongoDB error');
});

export default mongoose;
