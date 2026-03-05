import { Router } from 'express';
import { viewFeatureInterruptors } from './dashboard-feature-interruptor.controller.js';

const router = Router();

router.get('/', viewFeatureInterruptors);

export default router;
