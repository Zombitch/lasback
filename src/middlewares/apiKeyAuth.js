import crypto from 'crypto';
import { config } from '../utils/configLoader.js';

/**
 * Timing-safe comparison of two strings.
 * Prevents timing side-channel attacks on API key validation.
 */
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Compare against self to keep constant time, then return false
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export function apiKeyAuth(req, res, next) {
  const providedKey = req.header('x-api-key');

  if (!providedKey) {
    return res.status(401).json({
      success: false,
      message: 'Missing API key',
    });
  }

  const isValid = config.apiKeys.some((key) => timingSafeEqual(key, providedKey));

  if (!isValid) {
    return res.status(401).json({
      success: false,
      message: 'Invalid API key',
    });
  }

  req.apiKey = providedKey;
  next();
}
