import { Visit } from '../visit/visit.model.js';
import { Event } from '../analytics/analytics.model.js';
import { Rank } from '../rank/rank.model.js';

export async function viewVisitsDetails(req, res) {
    const { year, month } = req.query;
    const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const end = new Date(year, month, 1, 0, 0, 0, 0);
    const visits = await Visit.find({
        createdAt: {
        $gte: start,
        $lt: end,
        }
    }).sort({ createdAt: -1 });

    res.render('dashboard-visits-details', { visits: visits });
}

export async function viewVisits(req, res) {
    try {
      const monthlyAgg = await Visit.aggregate([
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
          },
          count: { $sum: 1 },
        },
      },
      {
        $sort: {
          '_id.year': 1,
          '_id.month': 1,
        },
      },
    ]);

    // Step 2: reshape into { [year]: [ { monthName, count }, ... ], maxCountPerYear }
    const monthNames = [
      'Jan','Feb','Mar','Apr','May','Jun',
      'Jul','Aug','Sep','Oct','Nov','Dec'
    ];
    const yearlyStats = {};

    monthlyAgg.forEach(row => {
      const year = row._id.year;
      const monthIdx = row._id.month; // 1-12
      const count = row.count;

      if (!yearlyStats[year]) {
        yearlyStats[year] = {
          months: [],
          maxCount: 0,
        };
      }

      yearlyStats[year].months.push({
        monthIndex: monthIdx,
        monthName: monthNames[monthIdx - 1],
        count,
      });

      if (count > yearlyStats[year].maxCount) {
        yearlyStats[year].maxCount = count;
      }
    });

    // Step 3: sort months within each year by month index ascending
    Object.keys(yearlyStats).forEach(yearKey => {
      yearlyStats[yearKey].months.sort((a, b) => a.monthIndex - b.monthIndex);
    });

    // Step 4: sort years ascending numerically
    // we also want an array form for easy iteration in EJS:
    const yearlyArray = Object.keys(yearlyStats)
      .sort((a, b) => Number(a) - Number(b))
      .map(yearKey => {
        return {
          year: Number(yearKey),
          maxCount: yearlyStats[yearKey].maxCount,
          months: yearlyStats[yearKey].months,
        };
      });

    // total visits across all time for header / context
    const total = await Visit.countDocuments();

    res.render('dashboard-visits', { total, yearlyArray });
  } catch (err) {
    next(err);
  }
}

function buildDateFilter(from, to) {
  const dateFilter = {};
  if (from) {
    const d = new Date(from);
    if (!isNaN(d)) dateFilter.$gte = d;
  }
  if (to) {
    const d = new Date(to);
    if (!isNaN(d)) {
      d.setHours(23, 59, 59, 999);
      dateFilter.$lte = d;
    }
  }
  return dateFilter;
}

export async function viewSourceEvents(req, res, next) {
  try {
    const { source } = req.params;
    const { userId, platform, version, from, to, page = 1 } = req.query;

    const filter = { source };
    if (userId) filter.userId = userId.trim();
    if (platform) filter.platform = platform;
    if (version) filter.version = version;

    const dateFilter = buildDateFilter(from, to);
    if (Object.keys(dateFilter).length) filter.createdAt = dateFilter;

    const limitNum = 50;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const skip = (pageNum - 1) * limitNum;

    const [events, total, platforms, versions] = await Promise.all([
      Event.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      Event.countDocuments(filter),
      Event.distinct('platform', { source }),
      Event.distinct('version', { source }),
    ]);

    res.render('dashboard-source-events', {
      source,
      events,
      total,
      page: pageNum,
      pages: Math.max(1, Math.ceil(total / limitNum)),
      platforms: platforms.filter(Boolean).sort(),
      versions: versions.filter(Boolean).sort(),
      filters: {
        userId: userId || '',
        platform: platform || '',
        version: version || '',
        from: from || '',
        to: to || '',
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function viewAnalytics(req, res, next) {
  try {
    const { source } = req.query;

    const match = {};
    if (source) match.source = source;

    const pipeline = (field) => [
      { $match: match },
      { $group: { _id: `$${field}`, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 15 },
    ];

    const [
      total,
      bySource,
      byAction,
      byCountry,
      byPlatform,
      byCategory,
      byDay,
      sources,
    ] = await Promise.all([
      Event.countDocuments(match),
      Event.aggregate(pipeline('source')),
      Event.aggregate(pipeline('action')),
      Event.aggregate(pipeline('country')),
      Event.aggregate(pipeline('platform')),
      Event.aggregate(pipeline('category')),
      Event.aggregate([
        { $match: match },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
        { $limit: 30 },
      ]),
      // All distinct sources for filter select
      Event.distinct('source'),
    ]);

    const maxByDay = byDay.length ? Math.max(...byDay.map((d) => d.count)) : 1;

    res.render('dashboard-analytics', {
      total,
      bySource,
      byAction,
      byCountry,
      byPlatform,
      byCategory,
      byDay,
      maxByDay,
      sources: sources.filter(Boolean).sort(),
      activeSource: source || null,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /dashboard/rank
 *
 * List rank submissions, filterable by source, userId, and a specific value.
 * When filtering by value, each matching entry shows which label (by index)
 * that value is paired with — rather than a raw array index.
 */
export async function viewRank(req, res, next) {
  try {
    const { source, userId, value, page = 1 } = req.query;

    const filter = {};
    if (source) filter.source = source;
    if (userId) filter.userId = userId.trim();

    const numValue = value !== undefined && value !== '' ? Number(value) : null;
    const hasValueFilter = numValue !== null && !Number.isNaN(numValue);
    if (hasValueFilter) filter.values = numValue;

    const limitNum = 50;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const skip = (pageNum - 1) * limitNum;

    const [ranks, total, sources] = await Promise.all([
      Rank.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      Rank.countDocuments(filter),
      Rank.distinct('source'),
    ]);

    // Pair each value with its label (same index) and, when a value filter
    // is active, flag which pair matched it.
    const entries = ranks.map((r) => {
      const pairs = (r.labels || []).map((label, i) => ({
        label,
        value: r.values[i],
        matched: hasValueFilter && r.values[i] === numValue,
      }));
      const matchedPair = hasValueFilter ? pairs.find((p) => p.matched) : null;
      return {
        ...r,
        pairs,
        matchedLabel: matchedPair ? matchedPair.label : null,
      };
    });

    res.render('dashboard-rank', {
      ranks: entries,
      total,
      page: pageNum,
      pages: Math.max(1, Math.ceil(total / limitNum)),
      sources: sources.filter(Boolean).sort(),
      filters: {
        source: source || '',
        userId: userId || '',
        value: value || '',
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /dashboard/rank/:id
 *
 * Show a single rank submission with its full label/value pairs.
 */
export async function viewRankDetail(req, res, next) {
  try {
    const { id } = req.params;
    const rank = await Rank.findById(id).lean();

    if (!rank) {
      return res.status(404).render('dashboard-rank-detail', { rank: null, pairs: [], error: 'Rank entry not found' });
    }

    const pairs = (rank.labels || []).map((label, i) => ({ label, value: rank.values[i] }));

    res.render('dashboard-rank-detail', { rank, pairs, error: null });
  } catch (err) {
    next(err);
  }
}