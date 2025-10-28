import { config } from '../utils/configLoader.js';

/**
 * Extra request-time validation that this request is coming
 * from an approved front-end domain.
 *
 * If there's no Origin/Referer header, we let it pass because
 * that often means it's server-to-server (cron, backend, mobile app, etc.).
 * You can change that policy if you want to force ALL callers to identify.
 */
export function checkOriginAllowed(req, res, next) {
  const originHeader = req.headers.origin;
  const refererHeader = req.headers.referer;

  // Extract origin from referer if origin is missing
  // ex: referer "https://app.example.com/some/page"
  let derivedOrigin = null;
  if (!originHeader && refererHeader) {
    try {
      const url = new URL(refererHeader);
      derivedOrigin = `${url.protocol}//${url.host}`;
    } catch {
      // bad/malformed referer; ignore
    }
  }

  const candidate = originHeader || derivedOrigin;
  const allowed = config.corsAllowedOrigins.includes(candidate) || config.corsAllowedOrigins.includes('*');

  if (!allowed) {
    return res.status(403).json({
      success: false,
      message: 'Origin not allowed',
    });
  }

  next();
}
