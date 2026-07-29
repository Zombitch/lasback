import { Router } from 'express';
import {
  viewVisits,
  viewVisitsDetails,
  viewAnalytics,
  viewSourceEvents,
  viewRank,
  viewRankDetail,
} from './dashboard.controller.js';

const router = Router();

router.get('/visits-details', viewVisitsDetails);
router.get('/visits', viewVisits);
router.get('/analytics/source/:source', viewSourceEvents);
router.get('/analytics', viewAnalytics);
router.get('/rank/:id', viewRankDetail);
router.get('/rank', viewRank);

export default router;
