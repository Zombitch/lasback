import { FeatureInterruptor } from './feature-interruptor.model.js';

/**
 * GET /feature-interruptor?appId=xxx&featureId=yyy[&featureName=zzz]
 *
 * Returns the feature flag value for the given app + feature pair.
 */
export async function getFeature(req, res) {
  const { appId, featureId } = req.query;

  if (!appId || !featureId) {
    return res.status(400).json({
      success: false,
      message: '`appId` and `featureId` query parameters are required',
    });
  }

  const feature = await FeatureInterruptor.findOne({
    appId,
    featureId,
  }).lean();

  if (!feature) {
    return res.status(404).json({
      success: false,
      message: 'Feature not found',
    });
  }

  return res.status(200).json({
    success: true,
    appId: feature.appId,
    appName: feature.appName,
    featureId: feature.featureId,
    featureName: feature.featureName,
    value: feature.value,
  });
}
