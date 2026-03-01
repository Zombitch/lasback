import { createRequire } from 'module';
import { Event } from './analytics.model.js';

// geoip-lite is CommonJS — import via createRequire
const require = createRequire(import.meta.url);
const geoip = require('geoip-lite');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Validate and sanitize the optional `metadata` field.
 * Only plain objects are accepted; arrays, strings, functions… are rejected.
 */
function sanitizeMetadata(raw) {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  // Limit depth to 2 levels to avoid excessively nested documents
  return JSON.parse(JSON.stringify(raw, (_key, value) => {
    if (typeof value === 'function') return undefined;
    return value;
  }));
}

/**
 * Build a MongoDB date-range filter from `from` / `to` query params.
 */
function buildDateFilter(from, to) {
  if (!from && !to) return {};
  const dateFilter = {};
  if (from) {
    const d = new Date(from);
    if (!isNaN(d)) dateFilter.$gte = d;
  }
  if (to) {
    const d = new Date(to);
    if (!isNaN(d)) dateFilter.$lte = d;
  }
  return Object.keys(dateFilter).length ? { createdAt: dateFilter } : {};
}

// ─── Controllers ─────────────────────────────────────────────────────────────

/**
 * POST /analytics/event
 *
 * Record a single analytics event.
 * `action` is the only required field; everything else is optional.
 *
 * Body params (all optional except action):
 *   source, version, userId, sessionId, action, category,
 *   platform, value, duration, metadata
 *
 * Server fills in automatically: ip, country (via geoip), userAgent, createdAt
 */
export async function postEvent(req, res) {
  const {
    source,
    version,
    userId,
    sessionId,
    action,
    category,
    platform,
    value,
    duration,
    metadata,
  } = req.body ?? {};

  if (!action || typeof action !== 'string' || action.trim() === '') {
    return res.status(400).json({
      success: false,
      message: '`action` is required and must be a non-empty string',
    });
  }

  // Numeric fields — reject NaN / non-numbers
  const numValue = value !== undefined ? Number(value) : undefined;
  const numDuration = duration !== undefined ? Number(duration) : undefined;

  if (value !== undefined && isNaN(numValue)) {
    return res.status(400).json({ success: false, message: '`value` must be a number' });
  }
  if (duration !== undefined && isNaN(numDuration)) {
    return res.status(400).json({ success: false, message: '`duration` must be a number' });
  }

  // Auto-detect IP and country
  const ip = req.ip ?? null;
  const geo = ip ? geoip.lookup(ip) : null;
  const country = geo?.country ?? null;

  const event = await Event.create({
    source: source?.toString().trim().slice(0, 100),
    version: version?.toString().trim().slice(0, 50),
    userId: userId?.toString().trim().slice(0, 200),
    sessionId: sessionId?.toString().trim().slice(0, 200),
    ip,
    country,
    userAgent: req.headers['user-agent']?.slice(0, 500),
    platform: platform?.toString().trim().slice(0, 50),
    action: action.trim().slice(0, 200),
    category: category?.toString().trim().slice(0, 100),
    value: numValue,
    duration: numDuration,
    metadata: sanitizeMetadata(metadata),
  });

  return res.status(201).json({
    success: true,
    id: event._id,
    timestamp: event.createdAt,
  });
}

/**
 * GET /analytics/events
 *
 * List events with optional filtering and pagination.
 *
 * Query params:
 *   source, action, category, userId, sessionId, country,
 *   from (ISO date), to (ISO date),
 *   page (default 1), limit (default 50, max 500)
 */
export async function getEvents(req, res) {
  const {
    source,
    action,
    category,
    userId,
    sessionId,
    country,
    from,
    to,
    page = 1,
    limit = 50,
  } = req.query;

  // Build filter
  const filter = {};
  if (source) filter.source = source;
  if (action) filter.action = action;
  if (category) filter.category = category;
  if (userId) filter.userId = userId;
  if (sessionId) filter.sessionId = sessionId;
  if (country) filter.country = country.toUpperCase();
  Object.assign(filter, buildDateFilter(from, to));

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(500, Math.max(1, parseInt(limit, 10) || 50));
  const skip = (pageNum - 1) * limitNum;

  const [events, total] = await Promise.all([
    Event.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
    Event.countDocuments(filter),
  ]);

  return res.status(200).json({
    success: true,
    total,
    page: pageNum,
    limit: limitNum,
    pages: Math.ceil(total / limitNum),
    events,
  });
}

/**
 * GET /analytics/stats
 *
 * Aggregated statistics.
 *
 * Query params (all optional):
 *   source — filter by a specific source
 *   from, to — date range (ISO dates)
 *
 * Returns:
 *   - total event count
 *   - breakdown by source, action, category, country, platform
 *   - unique users / sessions count
 *   - daily event counts (last 30 days by default)
 *   - average value / duration (when present)
 */
export async function getStats(req, res) {
  const { source, from, to } = req.query;

  const matchStage = {};
  if (source) matchStage.source = source;
  Object.assign(matchStage, buildDateFilter(from, to)?.createdAt
    ? { createdAt: buildDateFilter(from, to).createdAt }
    : {});

  // Re-build cleanly
  const dateFilter = buildDateFilter(from, to);
  const match = { ...matchStage, ...dateFilter };

  const pipeline = (groupField) => [
    { $match: match },
    { $group: { _id: `$${groupField}`, count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 30 },
  ];

  const [
    bySource,
    byAction,
    byCategory,
    byCountry,
    byPlatform,
    byDay,
    uniqueUsers,
    uniqueSessions,
    total,
    valueStats,
  ] = await Promise.all([
    Event.aggregate(pipeline('source')),
    Event.aggregate(pipeline('action')),
    Event.aggregate(pipeline('category')),
    Event.aggregate(pipeline('country')),
    Event.aggregate(pipeline('platform')),

    // Events per day
    Event.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      { $limit: 90 },
    ]),

    // Unique users
    Event.aggregate([
      { $match: { ...match, userId: { $ne: null, $exists: true } } },
      { $group: { _id: '$userId' } },
      { $count: 'count' },
    ]),

    // Unique sessions
    Event.aggregate([
      { $match: { ...match, sessionId: { $ne: null, $exists: true } } },
      { $group: { _id: '$sessionId' } },
      { $count: 'count' },
    ]),

    // Total
    Event.countDocuments(match),

    // Avg value / duration
    Event.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          avgValue: { $avg: '$value' },
          avgDuration: { $avg: '$duration' },
          totalDuration: { $sum: '$duration' },
        },
      },
    ]),
  ]);

  const stats = valueStats[0] ?? {};

  return res.status(200).json({
    success: true,
    total,
    uniqueUsers: uniqueUsers[0]?.count ?? 0,
    uniqueSessions: uniqueSessions[0]?.count ?? 0,
    avgValue: stats.avgValue ?? null,
    avgDuration: stats.avgDuration ?? null,
    totalDuration: stats.totalDuration ?? null,
    bySource,
    byAction,
    byCategory,
    byCountry,
    byPlatform,
    byDay,
  });
}
