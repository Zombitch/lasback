import { Visit } from '../visit/visit.model.js';
import { Event } from '../analytics/analytics.model.js';

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