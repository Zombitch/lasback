import { config } from '../utils/configLoader.js';

export function apiKeyAuth(req, res, next) {
  // Read the key from headers. Could also allow query param, but header is cleaner.
  const providedKey = req.header('x-api-key');

  if (!providedKey) {
    return res.status(401).json({
      success: false,
      message: 'Missing API key',
    });
  }

  // Constant-time-ish comparison isn't critical for public keys,
  // but we still don't just == blindly. Simple check is OK here.
  const isValid = config.apiKeys.includes(providedKey);

  if (!isValid) {
    return res.status(401).json({
      success: false,
      message: 'Invalid API key',
    });
  }

  // Optionally attach info about which key was used
  req.apiKey = providedKey;

  next();
}
