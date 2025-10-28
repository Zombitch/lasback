import { Router } from 'express';
import { getVisit, postVisit } from './visit.controller.js';

const router = Router();

router.post('/', postVisit);
router.get('/', getVisit);

export default router;
