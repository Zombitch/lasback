import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { renderHome, renderScene, serveAmbianceSound, serveAmbianceImage } from './weather.controller.js';

const router = Router();

/**
 * This route is intentionally public (no apiKeyAuth/checkOriginAllowed/totpAuth).
 * It's the one endpoint anyone can hit with no credentials, so it gets its own
 * limiter instead of sharing the app-wide one — a spammer here shouldn't be
 * able to eat into the quota legitimate API callers share on the same IP.
 */
const weatherLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(weatherLimiter);

router.get('/', renderHome);
router.get('/sounds/:ambianceId/:role.wav', serveAmbianceSound);
router.get('/images/:ambianceId/:role', serveAmbianceImage);
router.get('/:ambianceId', renderScene);

export default router;
