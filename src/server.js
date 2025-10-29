import http from 'http';
import app from './app.js';
import { config } from './utils/configLoader.js';
import { logger } from './utils/logger.js';
import { connectMongo, disconnectMongo } from './utils/mongo.js';

// trust proxy can matter if you're behind reverse proxy / load balancer
app.set('trust proxy', 1);

await connectMongo();

const server = http.createServer(app);

server.listen(config.port, () => {
  logger.info(`las-back listening on port ${config.port} (${config.env})`);
});

// Handle unhandled promise rejections so the process doesn't continue in a weird state
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled Promise Rejection');
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught Exception');
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  try {
    logger.info('Received SIGINT. Closing Mongo connection...');
    await disconnectMongo();
    logger.info('Mongo disconnected, exiting.');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Error during shutdown');
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM. Closing Mongo connection...');
  await disconnectMongo();
  process.exit(0);
});
