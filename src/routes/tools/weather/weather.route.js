import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { renderWeather, serveRainSound, serveThunderSound } from './weather.controller.js';

const router = Router();

/**
 * This route is intentionally public (no apiKeyAuth/checkOriginAllowed/totpAuth).
 * It's the one endpoint anyone can hit with no credentials, so it gets its own
 * limiter instead of sharing the app-wide one — a spammer here shouldn't be
 * able to eat into the quota legitimate API callers share on the same IP.
 * Serving is just two cached static files now (no per-request synthesis), so
 * this mainly guards against pointless bandwidth abuse rather than CPU cost.
 */
const weatherLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(weatherLimiter);

router.get('/', renderWeather);
router.get('/sounds/rain.wav', serveRainSound);
router.get('/sounds/thunder.wav', serveThunderSound);

export default router;
