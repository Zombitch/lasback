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

  /**
   * Allowlist of usernames that may log in via TOTP (src/routes/totp).
   * The login form's username is checked against this list — it's not tied
   * to a specific TOTP secret, all admins still share the same secret pool.
   */
  adminUsernames: (getEnvVar('ADMIN_USERNAMES', { required: false }) || '')
    .split(',')
    .map(u => u.trim())
    .filter(Boolean),

  sessionSecret: getSecret('SESSION_SECRET'),
  jwtSecret: getSecret('JWT_SECRET'),

  jwtExpiresIn: getEnvVar('JWT_EXPIRES_IN', { required: false }) || '7d',

  /**
   * One-time bootstrap token required to complete initial TOTP enrollment
   * (POST/GET /totp/setup while no admin TOTP exists yet).
   *
   * Without this, the very first person to reach /totp/setup on a fresh
   * deployment — not necessarily the real operator — permanently becomes
   * the admin and locks everyone else out. Required in production; optional
   * in dev so local setup stays frictionless.
   */
  totpSetupToken: isProd
    ? getEnvVar('TOTP_SETUP_TOKEN')
    : getEnvVar('TOTP_SETUP_TOKEN', { required: false }) || null,
};
