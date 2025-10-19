import { randomBytes } from 'crypto';
import fs from 'fs/promises';
import path from 'path';

export const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

export const randomDelay = (baseMs: number, jitterPercent: number = 20): number => {
  const jitter = baseMs * (jitterPercent / 100);
  return Math.round(baseMs + (Math.random() * jitter * 2 - jitter));
};

export const generateRandomString = (length: number = 16): string => {
  return randomBytes(length).toString('hex');
};

export const ensureDirectoryExists = async (dirPath: string): Promise<void> => {
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
  }
};

export const cleanupTempFile = async (filePath: string): Promise<void> => {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    // Ignore errors if file doesn't exist
  }
};

export const formatDate = (date: Date): string => {
  return date.toISOString();
};

export const sanitizeFilename = (filename: string): string => {
  return filename.replace(/[^a-z0-9._-]/gi, '_').toLowerCase();
};

export const getTempFilePath = (extension: string = 'tmp'): string => {
  const randomName = generateRandomString(12);
  return path.join(process.cwd(), 'archives_media', `${randomName}.${extension}`);
};
