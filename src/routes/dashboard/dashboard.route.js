import { Router } from 'express';
import { viewVisits, viewVisitsDetails } from './dashboard.controller.js';

const router = Router();

router.get('/visits-details', viewVisitsDetails);
router.get('/visits', viewVisits);

export default router;
