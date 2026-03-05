import { Router } from 'express';
import { getFeature } from './feature-interruptor.controller.js';

const router = Router();

/**
 * GET /feature-interruptor
 * Query params: appId, featureId, featureName (optional)
 * Returns the feature's enabled/disabled status.
 */
router.get('/', getFeature);

export default router;
