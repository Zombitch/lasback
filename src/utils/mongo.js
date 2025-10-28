import mongoose from 'mongoose';
import { config } from '../utils/configLoader.js';
import { logger } from './logger.js';

export async function connectMongo() {
  const uri = process.env.MONGO_URI;

  try {
    await mongoose.connect(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000, // fail fast if unreachable
    });
    logger.info(`✅ Connected to MongoDB`);
  } catch (err) {
    logger.error(err, '❌ Failed to connect to MongoDB');
    throw err;
  }

  // Handle errors after initial connection
  mongoose.connection.on('error', (err) => {
    logger.error({ err }, '❌ MongoDB connection error');
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('⚠️ MongoDB disconnected');
  });
}

export async function disconnectMongo() {
  await mongoose.disconnect();
  logger.info('🔌 MongoDB connection closed');
}
