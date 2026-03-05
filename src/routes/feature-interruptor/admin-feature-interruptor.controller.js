import { FeatureInterruptor } from './feature-interruptor.model.js';

/**
 * GET /admin/feature-interruptors
 * Returns all feature interruptors, sorted by appName then featureId.
 */
export async function listFeatures(_req, res) {
  const features = await FeatureInterruptor.find()
    .sort({ appName: 1, appId: 1, featureId: 1 })
    .lean();
  return res.status(200).json({ success: true, features });
}

/**
 * POST /admin/feature-interruptors
 * Body: { appId, appName?, featureId, featureName?, value }
 */
export async function createFeature(req, res) {
  const { appId, appName, featureId, featureName, value } = req.body ?? {};

  if (!appId || !featureId) {
    return res.status(400).json({
      success: false,
      message: '`appId` and `featureId` are required',
    });
  }

  if (typeof value !== 'boolean') {
    return res.status(400).json({
      success: false,
      message: '`value` must be a boolean',
    });
  }

  const existing = await FeatureInterruptor.findOne({ appId, featureId });
  if (existing) {
    return res.status(409).json({
      success: false,
      message: 'A feature interruptor with this appId and featureId already exists',
    });
  }

  const feature = await FeatureInterruptor.create({
    appId: appId.trim(),
    appName: (appName || '').trim(),
    featureId: featureId.trim(),
    featureName: (featureName || '').trim(),
    value,
  });

  return res.status(201).json({ success: true, feature });
}

/**
 * PUT /admin/feature-interruptors/:id
 * Body: { appId?, appName?, featureId?, featureName?, value? }
 */
export async function updateFeature(req, res) {
  const { id } = req.params;
  const { appId, appName, featureId, featureName, value } = req.body ?? {};

  const feature = await FeatureInterruptor.findById(id);
  if (!feature) {
    return res.status(404).json({
      success: false,
      message: 'Feature interruptor not found',
    });
  }

  if (appId !== undefined) feature.appId = appId.trim();
  if (appName !== undefined) feature.appName = appName.trim();
  if (featureId !== undefined) feature.featureId = featureId.trim();
  if (featureName !== undefined) feature.featureName = featureName.trim();
  if (typeof value === 'boolean') feature.value = value;

  await feature.save();

  return res.status(200).json({ success: true, feature });
}

/**
 * DELETE /admin/feature-interruptors/:id
 */
export async function deleteFeature(req, res) {
  const { id } = req.params;

  const feature = await FeatureInterruptor.findByIdAndDelete(id);
  if (!feature) {
    return res.status(404).json({
      success: false,
      message: 'Feature interruptor not found',
    });
  }

  return res.status(200).json({ success: true, message: 'Feature interruptor deleted' });
}
