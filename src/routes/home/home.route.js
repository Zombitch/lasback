import { Router } from 'express';
import { Visit } from '../visit/visit.model.js';
import { Event } from '../analytics/analytics.model.js';

const router = Router();

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

router.get('/', async (_req, res, next) => {
  try {
    const [totalVisits, totalEvents] = await Promise.all([
      Visit.countDocuments(),
      Event.countDocuments(),
    ]);

    // Events recorded in the last 24 h
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [recentVisits, recentEvents] = await Promise.all([
      Visit.countDocuments({ createdAt: { $gte: since24h } }),
      Event.countDocuments({ createdAt: { $gte: since24h } }),
    ]);

    res.render('home', {
      totalVisits,
      totalEvents,
      recentVisits,
      recentEvents,
      uptime: formatUptime(Math.floor(process.uptime())),
      env: process.env.NODE_ENV ?? 'development',
      year: new Date().getFullYear(),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
