import { FeatureInterruptor } from './feature-interruptor.model.js';

/**
 * GET /dashboard/feature-interruptors
 * Renders the back-office management page, grouped by appName.
 */
export async function viewFeatureInterruptors(_req, res, next) {
  try {
    const features = await FeatureInterruptor.find()
      .sort({ appName: 1, appId: 1, featureId: 1 })
      .lean();

    // Group by appName (fall back to appId if no name)
    const grouped = {};
    for (const f of features) {
      const groupKey = f.appName || f.appId;
      if (!grouped[groupKey]) {
        grouped[groupKey] = [];
      }
      grouped[groupKey].push(f);
    }

    const total = features.length;
    const enabledCount = features.filter((f) => f.value).length;

    res.render('dashboard-feature-interruptor', {
      grouped,
      total,
      enabledCount,
    });
  } catch (err) {
    next(err);
  }
}
