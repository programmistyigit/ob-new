import { config } from 'dotenv';
import { z } from 'zod';
import path from 'path';

config();

const envSchema = z.object({
  API_ID: z.string().min(1, 'API_ID is required'),
  API_HASH: z.string().min(1, 'API_HASH is required'),
  BOT_TOKEN: z.string().min(1, 'BOT_TOKEN is required'),
  ENABLE_STARS: z
    .string()
    .default('true')
    .transform((val) => val === 'true'),
  STAR_PRICE: z
    .string()
    .default('100')
    .transform((val) => parseInt(val, 10)),
  PROVIDER_TOKEN: z.string().optional(),
  MONGO_URI: z.string().default('mongodb://localhost:27017/oblivionlog'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  MEDIA_DIR: z.string().default('./archives_media'),
  TRIAL_DAYS: z
    .string()
    .default('7')
    .transform((val) => parseInt(val, 10)),
});

export type EnvConfig = z.infer<typeof envSchema>;

let parsedEnv: EnvConfig;

try {
  parsedEnv = envSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error('❌ Environment validation failed:');
    error.errors.forEach((err) => {
      console.error(`  - ${err.path.join('.')}: ${err.message}`);
    });
    process.exit(1);
  }
  throw error;
}

export const env = parsedEnv;

export const mediaDir = path.resolve(process.cwd(), env.MEDIA_DIR);
