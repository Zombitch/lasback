import { Totp } from '../routes/totp/totp.model.js';

/**
 * Middleware that gates view routes behind TOTP authentication.
 *
 * - No TOTP in DB  → redirect to /totp/setup
 * - TOTP exists but session not verified → redirect to /totp/verify
 * - TOTP exists and session verified → next()
 */
export async function totpAuth(req, res, next) {
  try {
    const count = await Totp.countDocuments();

    if (count === 0) {
      return res.redirect('/totp/setup');
    }

    if (!req.session || !req.session.totpVerified) {
      return res.redirect('/totp/verify');
    }

    next();
  } catch (err) {
    next(err);
  }
}
