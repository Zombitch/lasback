import { Router } from 'express';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import { Totp } from './totp.model.js';
import { logger } from '../../utils/logger.js';

const router = Router();

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

    const totp = new OTPAuth.TOTP({
      issuer: ISSUER,
      label: 'admin',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret,
    });

    const otpauthUri = totp.toString();
    const qrDataUrl = await QRCode.toDataURL(otpauthUri);

    logger.info(
      {
        secretPrefix: secret.base32.slice(0, 4) + '…',
        sessionSecret: req.session.pendingTotpSecret.slice(0, 4) + '…',
        uriPreview: otpauthUri.slice(0, 60) + '…',
      },
      '[TOTP-SETUP] Rendering setup page',
    );

    res.render('totp-setup', {
      qrDataUrl,
      secret: secret.base32,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /totp/setup ───────────────────────────────────────────────────────
// Verify the code entered by the user against the pending secret,
// then persist the secret in DB.
router.post('/setup', async (req, res, next) => {
  try {
    const count = await Totp.countDocuments();
    if (count > 0) {
      return res.redirect('/totp/verify');
    }

    const rawCode = req.body.code;
    const code = sanitizeCode(rawCode);
    const pendingSecret = req.session.pendingTotpSecret;

    if (!pendingSecret) {
      logger.warn('[TOTP-SETUP] No pendingTotpSecret in session — redirecting to GET /setup');
      return res.redirect('/totp/setup');
    }

    const reconstructed = OTPAuth.Secret.fromBase32(pendingSecret);
    const totp = new OTPAuth.TOTP({
      issuer: ISSUER,
      label: 'admin',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: reconstructed,
    });

    const serverTime = new Date();
    const expectedToken = totp.generate();
    const delta = totp.validate({ token: code, window: TOTP_WINDOW });

    // Log the base32 round-trip to detect encoding mismatches
    const roundTrippedBase32 = reconstructed.base32;

    logger.info(
      {
        serverTime: serverTime.toISOString(),
        serverEpoch: Math.floor(serverTime.getTime() / 1000),
        timeStep: Math.floor(serverTime.getTime() / 30000),
        rawCode,
        sanitizedCode: code,
        expectedToken,
        delta,
        secretPrefix: pendingSecret.slice(0, 4) + '…',
        base32RoundTripMatch: pendingSecret === roundTrippedBase32,
      },
      '[TOTP-SETUP] Validation attempt',
    );

    if (delta === null) {
      // Invalid code — re-generate QR with same secret
      const otpauthUri = totp.toString();
      const qrDataUrl = await QRCode.toDataURL(otpauthUri);
      return res.render('totp-setup', {
        qrDataUrl,
        secret: pendingSecret,
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
// Validate the code against all stored TOTP secrets.
router.post('/verify', async (req, res, next) => {
  try {
    const count = await Totp.countDocuments();
    if (count === 0) {
      return res.redirect('/totp/setup');
    }

    const rawCode = req.body.code;
    const code = sanitizeCode(rawCode);
    const secrets = await Totp.find();

    const serverTime = new Date();
    logger.info(
      {
        serverTime: serverTime.toISOString(),
        serverEpoch: Math.floor(serverTime.getTime() / 1000),
        timeStep: Math.floor(serverTime.getTime() / 30000),
        rawCode,
        sanitizedCode: code,
        storedSecrets: secrets.length,
      },
      '[TOTP-VERIFY] Verification attempt',
    );

    let valid = false;
    for (const entry of secrets) {
      const totp = new OTPAuth.TOTP({
        issuer: ISSUER,
        label: entry.label,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(entry.secret),
      });

      const expectedToken = totp.generate();
      const delta = totp.validate({ token: code, window: TOTP_WINDOW });

      logger.info(
        {
          label: entry.label,
          expectedToken,
          delta,
          secretPrefix: entry.secret.slice(0, 4) + '…',
        },
        '[TOTP-VERIFY] Checked secret',
      );

      if (delta !== null) {
        valid = true;
        break;
      }
    }

    if (!valid) {
      logger.warn('[TOTP-VERIFY] All secrets exhausted — code rejected');
      return res.render('totp-verify', {
        error: 'Code invalide. Veuillez réessayer.',
      });
    }

    logger.info('[TOTP-VERIFY] Code accepted');

    req.session.totpVerified = true;
    res.redirect('/');
  } catch (err) {
    next(err);
  }
});

export default router;
