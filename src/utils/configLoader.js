import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const env = process.env.NODE_ENV || 'development';

function getEnvVar(name, { required = true } = {}) {
  const value = process.env[name];
  if (required && (value === undefined || value === '')) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const config = {
  env,
  isProd: env === 'production',
  isDev: env === 'development',
  port: parseInt(getEnvVar('PORT', { required: false }) || '4000', 10),

  corsAllowedOrigins: (getEnvVar('CORS_ALLOWED_ORIGINS', {
    required: false,
  }) || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean),

  apiKeys: getEnvVar('API_KEYS', { required: false })
    .split(',')
    .map(k => k.trim())
    .filter(Boolean),

  sessionSecret:
    getEnvVar('SESSION_SECRET', { required: false }) ||
    crypto.randomBytes(32).toString('hex'),

  jwtSecret:
    getEnvVar('JWT_SECRET', { required: false }) ||
    crypto.randomBytes(32).toString('hex'),

  jwtExpiresIn: getEnvVar('JWT_EXPIRES_IN', { required: false }) || '7d',
};
