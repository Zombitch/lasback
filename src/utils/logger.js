import pino from 'pino';
import { config } from './configLoader.js';

const level = config.isProd ? 'info' : 'debug';

export const logger = pino({
  level,
  transport: config.isProd
    ? undefined
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
});
