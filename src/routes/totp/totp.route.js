import { Router } from 'express';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import { Totp } from './totp.model.js';

const router = Router();

const ISSUER = 'LuxAnimaStudio';

// ─── GET /totp/setup ────────────────────────────────────────────────────────
// Show QR code page so the user can register their authenticator app.
// Blocked if a TOTP secret already exists in DB.
router.get('/setup', async (req, res, next) => {
  try {
    const count = await Totp.countDocuments();
    if (count > 0) {
      return res.redirect('/totp/verify');
    }

    const totp = new OTPAuth.TOTP({
      issuer: ISSUER,
      label: 'admin',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
    });

    // Store secret in session so we can verify it on POST
    req.session.pendingTotpSecret = totp.secret.base32;

    const otpauthUri = totp.toString();
    const qrDataUrl = await QRCode.toDataURL(otpauthUri);

    res.render('totp-setup', {
      qrDataUrl,
      secret: totp.secret.base32,
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

    const { code } = req.body;
    const pendingSecret = req.session.pendingTotpSecret;

    if (!pendingSecret) {
      return res.redirect('/totp/setup');
    }

    const totp = new OTPAuth.TOTP({
      issuer: ISSUER,
      label: 'admin',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(pendingSecret),
    });

    const delta = totp.validate({ token: code, window: 1 });

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

    const { code } = req.body;
    const secrets = await Totp.find();

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

      const delta = totp.validate({ token: code, window: 1 });
      if (delta !== null) {
        valid = true;
        break;
      }
    }

    if (!valid) {
      return res.render('totp-verify', {
        error: 'Code invalide. Veuillez réessayer.',
      });
    }

    req.session.totpVerified = true;
    res.redirect('/');
  } catch (err) {
    next(err);
  }
});

export default router;
