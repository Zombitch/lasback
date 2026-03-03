import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  createSave,
  getLatestSave,
  listVersions,
  getVersion,
} from './saves.controller.js';

/**
 * Rate limiter for save writes.
 * Reads use the global limiter; writes get a dedicated one.
 */
const saveWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many save requests, please slow down.',
  },
});

const router = Router();

/**
 * POST /v1/games/:gameId/saves/:slotKey
 * Create a new save version.
 * Requires: x-api-key + Authorization: Bearer <jwt>
 */
router.post('/:gameId/saves/:slotKey', saveWriteLimiter, createSave);

/**
 * GET /v1/games/:gameId/saves/:slotKey/latest
 * Get the latest save for a slot.
 */
router.get('/:gameId/saves/:slotKey/latest', getLatestSave);

/**
 * GET /v1/games/:gameId/saves/:slotKey
 * List version metadata (no payloads) for a slot.
 */
router.get('/:gameId/saves/:slotKey', listVersions);

/**
 * GET /v1/games/:gameId/saves/:slotKey/:version
 * Get a specific version (full payload).
 */
router.get('/:gameId/saves/:slotKey/:version', getVersion);

export default router;
