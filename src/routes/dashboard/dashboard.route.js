import { Router } from 'express';
import { viewVisits, viewVisitsDetails, viewAnalytics } from './dashboard.controller.js';

const router = Router();

router.get('/visits-details', viewVisitsDetails);
router.get('/visits', viewVisits);
router.get('/analytics', viewAnalytics);

export default router;
