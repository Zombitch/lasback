import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { postEvent, getEvents, getStats } from './analytics.controller.js';

/**
 * Dedicated rate limiter for analytics endpoints.
 *
 * Games / sites can fire many events in a short burst (level-up, clicks, etc.)
 * so we allow more requests per window than the global limiter.
 * This limiter runs *after* the global one — effective ceiling stays at the
 * global limit; this only prevents per-route hammering above 300 req/15 min.
 */
const analyticsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many analytics requests, please slow down.' },
});

const router = Router();

router.use(analyticsLimiter);

/**
 * POST /analytics/event
 * Record a single analytics event.
 * Requires: x-api-key header + allowed Origin.
 */
router.post('/event', postEvent);

/**
 * GET /analytics/events
 * List events with optional filters (source, action, userId, from, to, page, limit).
 * Requires: x-api-key header + allowed Origin.
 */
router.get('/events', getEvents);

/**
 * GET /analytics/stats
 * Aggregated statistics (by source, action, country, day…).
 * Requires: x-api-key header + allowed Origin.
 */
router.get('/stats', getStats);

export default router;
