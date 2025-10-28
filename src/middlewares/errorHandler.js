import { logger } from '../utils/logger.js';

export function errorHandler(err, req, res, next) {
  // Log full error (stack etc.) for observability
  logger.error(
    {
      err,
      path: req.path,
      method: req.method,
    },
    err.message
  );

  // Don't leak internal details in production
  const status = err.statusCode || 500;

  res.status(status).json({
    success: false,
    message:
      status === 500
        ? 'Internal server error'
        : err.message || 'Unhandled error',
  });
}
