import { Router } from 'express';
import {
  listFeatures,
  createFeature,
  updateFeature,
  deleteFeature,
} from './admin-feature-interruptor.controller.js';

const router = Router();

// ─── JSON API (consumed by the back-office dashboard) ────────────────────────

router.get('/feature-interruptors', listFeatures);
router.post('/feature-interruptors', createFeature);
router.put('/feature-interruptors/:id', updateFeature);
router.delete('/feature-interruptors/:id', deleteFeature);

export default router;
