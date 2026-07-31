import { Router } from 'express';
import { deleteRank } from './admin-rank.controller.js';

const router = Router();

// ─── JSON API (consumed by the back-office dashboard) ────────────────────────

router.delete('/rank/:id', deleteRank);

export default router;
