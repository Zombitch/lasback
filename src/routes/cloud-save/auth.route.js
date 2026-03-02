import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { register, login } from './auth.controller.js';

/**
 * Strict rate limiter for auth endpoints to prevent brute-force attacks.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many auth requests, please slow down.',
  },
});

const router = Router();

router.use(authLimiter);

/**
 * POST /v1/auth/register
 * Create a new player account.
 * Requires: x-api-key header + allowed Origin.
 */
router.post('/register', register);

/**
 * POST /v1/auth/login
 * Log in and receive a JWT.
 * Requires: x-api-key header + allowed Origin.
 */
router.post('/login', login);

export default router;
