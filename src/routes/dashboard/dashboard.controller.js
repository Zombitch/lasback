import { Visit } from '../visit/visit.model.js'

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