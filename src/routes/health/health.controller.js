import { config } from '../../utils/configLoader.js';

export function getHealth(req, res) {
  res.status(200).json({
    status: 'ok',
    env: config.env,
    uptime: process.uptime(), // seconds
    timestamp: new Date().toISOString(),
  });
}
