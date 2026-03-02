import jwt from 'jsonwebtoken';
import { config } from '../utils/configLoader.js';

/**
 * Middleware that authenticates player requests using JWT Bearer tokens.
 *
 * Sets req.player = { id, username } on success.
 * The player id comes from the token — the client never controls it.
 */
export function playerAuth(req, res, next) {
  const authHeader = req.header('authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Missing or invalid Authorization header',
    });
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    req.player = { id: decoded.sub, username: decoded.username };
    next();
  } catch {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
    });
  }
}
