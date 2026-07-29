import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { postRank } from './rank.controller.js';

/**
 * Dedicated rate limiter for the rank endpoint.
 *
 * This limiter runs *after* the global one — effective ceiling stays at the
 * global limit; this only prevents per-route hammering above 300 req/15 min.
 */
const rankLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many rank requests, please slow down.' },
});

const router = Router();

router.use(rankLimiter);

/**
 * POST /rank
 * Record a ranking submission (values/labels parallel arrays).
 * Requires: x-api-key header + allowed Origin.
 */
router.post('/', postRank);

export default router;
