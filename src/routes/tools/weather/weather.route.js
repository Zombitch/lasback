import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { renderWeather, serveDropSound, serveThunderSound } from './weather.controller.js';

const router = Router();

/**
 * This route is intentionally public (no apiKeyAuth/checkOriginAllowed/totpAuth).
 * It's the one endpoint anyone can hit with no credentials, so it gets its own
 * tighter limiter instead of sharing the app-wide one — a spammer here
 * shouldn't be able to eat into the quota legitimate API callers share on the
 * same IP.
 */
const weatherLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(weatherLimiter);

router.get('/', renderWeather);
router.get('/sounds/drop.wav', serveDropSound);
router.get('/sounds/thunder.wav', serveThunderSound);

export default router;
