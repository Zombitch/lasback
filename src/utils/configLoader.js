import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const env = process.env.NODE_ENV || 'development';
const isProd = env === 'production';

function getEnvVar(name, { required = true } = {}) {
  const value = process.env[name];
  if (required && (value === undefined || value === '')) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

/**
 * In production, SESSION_SECRET and JWT_SECRET MUST be set explicitly.
 * Auto-generating them means every restart invalidates all sessions/tokens,
 * and multi-instance deployments would each have different secrets.
 */
function getSecret(envName) {
  const value = getEnvVar(envName, { required: false });
  if (value) return value;
  if (isProd) {
    throw new Error(
      `${envName} must be set in production. ` +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }
  return crypto.randomBytes(32).toString('hex');
}

export const config = {
  env,
  isProd,
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

  sessionSecret: getSecret('SESSION_SECRET'),
  jwtSecret: getSecret('JWT_SECRET'),

  jwtExpiresIn: getEnvVar('JWT_EXPIRES_IN', { required: false }) || '7d',
};
