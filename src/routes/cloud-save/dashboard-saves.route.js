import { Router } from 'express';
import { viewSaves, viewSlotVersions } from './admin-saves.controller.js';

const router = Router();

/**
 * GET /dashboard/saves
 * Saves browser with game/player/slot filters.
 * Protected by TOTP auth.
 */
router.get('/', viewSaves);

/**
 * GET /dashboard/saves/slot/:slotId
 * Version history for a single slot.
 * Protected by TOTP auth.
 */
router.get('/slot/:slotId', viewSlotVersions);

export default router;
