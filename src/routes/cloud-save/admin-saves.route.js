import { Router } from 'express';
import {
  listGames,
  createGame,
  listSaves,
  inspectVersion,
  deleteVersion,
  deleteSlot,
  restoreVersion,
} from './admin-saves.controller.js';

const router = Router();

// ─── JSON API (consumed by admin dashboard or external tools) ────────────────

router.get('/games', listGames);
router.post('/games', createGame);
router.get('/games/:gameId/saves', listSaves);
router.get('/save-versions/:id', inspectVersion);
router.delete('/save-versions/:id', deleteVersion);
router.delete('/save-slots/:id', deleteSlot);
router.post('/save-versions/:id/restore', restoreVersion);

export default router;
