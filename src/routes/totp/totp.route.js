import { Router } from 'express';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import rateLimit from 'express-rate-limit';
import { Totp } from './totp.model.js';
import { logger } from '../../utils/logger.js';
import { config } from '../../utils/configLoader.js';
import { timingSafeEqual } from '../../middlewares/apiKeyAuth.js';

const router = Router();

/**
 * Rate limiter for TOTP endpoints to prevent brute-force of 6-digit codes.
 * 6 digits = 1 000 000 combinations; 5 attempts per 15 min makes brute-force infeasible.
 */
const totpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many attempts, please try again later.',
});

const ISSUER = 'LuxAnimaStudio';
const TOTP_WINDOW = 2; // ±2 time-steps (±60 s) to tolerate clock drift

/**
 * Sanitise the 6-digit code coming from the form:
 *  - trim surrounding whitespace
 *  - strip any inner spaces (some apps display "123 456")
 *  - left-pad with zeros so "1234" → "001234"
 */
function sanitizeCode(raw) {
  if (typeof raw !== 'string') return '';
  return raw.trim().replace(/\s/g, '').padStart(6, '0');
}

// ─── GET /totp/setup ────────────────────────────────────────────────────────
// Show QR code page so the user can register their authenticator app.
// Blocked if a TOTP secret already exists in DB.
router.get('/setup', async (req, res, next) => {
  try {
    const count = await Totp.countDocuments();
    if (count > 0) {
      return res.redirect('/totp/verify');
    }

    if (config.totpSetupToken && !timingSafeEqual(config.totpSetupToken, typeof req.query.token === 'string' ? req.query.token : '')) {
      logger.warn('[TOTP-SETUP] Rejected GET /setup: missing/invalid setup token');
      return res.status(403).send('A valid setup token is required to initialize TOTP. Append ?token=<TOTP_SETUP_TOKEN> to this URL.');
    }

    // Reuse the pending secret when one already lives in the session,
    // so a second GET (browser prefetch, favicon, refresh…) does NOT
    // overwrite the secret the user already scanned.
    let secret;
    if (req.session.pendingTotpSecret) {
      secret = OTPAuth.Secret.fromBase32(req.session.pendingTotpSecret);
      logger.debug('[TOTP-SETUP] Reusing existing pending secret from session');
    } else {
      secret = new OTPAuth.Secret();
      req.session.pendingTotpSecret = secret.base32;
      logger.debug('[TOTP-SETUP] Generated new secret');
    }

    const env = process.env.NODE_ENV || 'development';
    const totp = new OTPAuth.TOTP({
      issuer: ISSUER,
      label: env,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret,
    });

    const otpauthUri = totp.toString();
    const qrDataUrl = await QRCode.toDataURL(otpauthUri);

    logger.info('[TOTP-SETUP] Rendering setup page');

    res.render('totp-setup', {
      qrDataUrl,
      secret: secret.base32,
      setupToken: typeof req.query.token === 'string' ? req.query.token : '',
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /totp/setup ───────────────────────────────────────────────────────
// Verify the code entered by the user against the pending secret,
// then persist the secret in DB.
router.post('/setup', totpLimiter, async (req, res, next) => {
  try {
    const count = await Totp.countDocuments();
    if (count > 0) {
      return res.redirect('/totp/verify');
    }

    if (config.totpSetupToken && !timingSafeEqual(config.totpSetupToken, typeof req.body.token === 'string' ? req.body.token : '')) {
      logger.warn('[TOTP-SETUP] Rejected POST /setup: missing/invalid setup token');
      return res.status(403).json({ success: false, message: 'A valid setup token is required to initialize TOTP.' });
    }

    const rawCode = req.body.code;
    const code = sanitizeCode(rawCode);
    const pendingSecret = req.session.pendingTotpSecret;

    if (!pendingSecret) {
      logger.warn('[TOTP-SETUP] No pendingTotpSecret in session — redirecting to GET /setup');
      return res.redirect('/totp/setup');
    }

    const env = process.env.NODE_ENV || 'development';
    const reconstructed = OTPAuth.Secret.fromBase32(pendingSecret);
    const totp = new OTPAuth.TOTP({
      issuer: ISSUER,
      label: env,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: reconstructed,
    });

    const delta = totp.validate({ token: code, window: TOTP_WINDOW });

    logger.info({ delta }, '[TOTP-SETUP] Validation attempt');

    if (delta === null) {
      // Invalid code — re-generate QR with same secret
      const otpauthUri = totp.toString();
      const qrDataUrl = await QRCode.toDataURL(otpauthUri);
      return res.render('totp-setup', {
        qrDataUrl,
        secret: pendingSecret,
        setupToken: typeof req.body.token === 'string' ? req.body.token : '',
        error: 'Code invalide. Veuillez réessayer.',
      });
    }

    // Save secret to DB
    await Totp.create({ label: 'admin', secret: pendingSecret });

    // Clean up session and mark as verified
    delete req.session.pendingTotpSecret;
    req.session.totpVerified = true;

    res.redirect('/');
  } catch (err) {
    next(err);
  }
});

// ─── GET /totp/verify ───────────────────────────────────────────────────────
// Show the TOTP code input form.
// Only accessible when at least one TOTP exists in DB.
router.get('/verify', async (req, res, next) => {
  try {
    const count = await Totp.countDocuments();
    if (count === 0) {
      return res.redirect('/totp/setup');
    }

    // Already verified this session
    if (req.session && req.session.totpVerified) {
      return res.redirect('/');
    }

    res.render('totp-verify', {});
  } catch (err) {
    next(err);
  }
});

// ─── POST /totp/verify ──────────────────────────────────────────────────────
// Validate the submitted username against the ADMIN_USERNAMES allowlist AND
// the code against all stored TOTP secrets. Both checks always run — even
// when the username is already known to be invalid — so a bad username
// can't be distinguished from a bad code by response timing, and the error
// message never says which one failed.
router.post('/verify', totpLimiter, async (req, res, next) => {
  try {
    const count = await Totp.countDocuments();
    if (count === 0) {
      return res.redirect('/totp/setup');
    }

    const rawUsername = typeof req.body.username === 'string' ? req.body.username.trim() : '';
    const usernameValid =
      rawUsername.length > 0 &&
      config.adminUsernames.some((u) => u.toLowerCase() === rawUsername.toLowerCase());

    const rawCode = req.body.code;
    const code = sanitizeCode(rawCode);
    const secrets = await Totp.find();

    logger.info({ storedSecrets: secrets.length }, '[TOTP-VERIFY] Verification attempt');

    let codeValid = false;
    for (const entry of secrets) {
      const totp = new OTPAuth.TOTP({
        issuer: ISSUER,
        label: entry.label,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(entry.secret),
      });

      const delta = totp.validate({ token: code, window: TOTP_WINDOW });

      if (delta !== null) {
        codeValid = true;
        break;
      }
    }

    if (!usernameValid || !codeValid) {
      logger.warn({ usernameValid, codeValid }, '[TOTP-VERIFY] Rejected');
      return res.render('totp-verify', {
        error: "Nom d'utilisateur ou code invalide. Veuillez réessayer.",
        username: rawUsername,
      });
    }

    logger.info({ username: rawUsername }, '[TOTP-VERIFY] Accepted');

    req.session.totpVerified = true;
    req.session.totpUsername = rawUsername;
    res.redirect('/');
  } catch (err) {
    next(err);
  }
});

export default router;
