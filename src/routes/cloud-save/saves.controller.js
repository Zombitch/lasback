import crypto from 'crypto';
import { Game } from './game.model.js';
import { SaveSlot } from './saveSlot.model.js';
import { SaveVersion } from './saveVersion.model.js';

const MAX_VERSIONS = 101; // latest + 100 older

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Validate that a value is a plain JSON object (not array, null, etc.)
 */
function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// ─── Controllers ─────────────────────────────────────────────────────────────

/**
 * POST /v1/games/:gameId/saves/:slotKey
 *
 * Create a new save version for the authenticated player.
 * The playerId is taken from the JWT — never from the request body.
 *
 * Body: { payload: {...}, clientBuild?: string }
 */
export async function createSave(req, res) {
  const { gameId, slotKey } = req.params;
  const { payload, clientBuild } = req.body ?? {};
  const playerId = req.player.id;

  if (!isPlainObject(payload)) {
    return res.status(400).json({
      success: false,
      message: '`payload` must be a JSON object',
    });
  }

  // Verify game exists
  const game = await Game.findById(gameId);
  if (!game) {
    return res.status(404).json({
      success: false,
      message: 'Game not found',
    });
  }

  // Validate slotKey format
  if (!slotKey || slotKey.length > 50) {
    return res.status(400).json({
      success: false,
      message: '`slotKey` must be 1-50 characters',
    });
  }

  // Find-or-create slot and atomically increment version counter
  const slot = await SaveSlot.findOneAndUpdate(
    { gameId, playerId, slotKey },
    { $inc: { currentVersion: 1 } },
    { new: true, upsert: true },
  );

  const newVersion = slot.currentVersion;
  const payloadStr = JSON.stringify(payload);
  const payloadHash = crypto
    .createHash('sha256')
    .update(payloadStr)
    .digest('hex');

  const saveVersion = await SaveVersion.create({
    slotId: slot._id,
    version: newVersion,
    payload,
    payloadHash,
    clientBuild: clientBuild?.toString().trim().slice(0, 100),
  });

  // Prune: keep only the latest MAX_VERSIONS
  const cutoffVersion = newVersion - MAX_VERSIONS;
  if (cutoffVersion > 0) {
    await SaveVersion.deleteMany({
      slotId: slot._id,
      version: { $lte: cutoffVersion },
    });
  }

  return res.status(201).json({
    success: true,
    version: newVersion,
    id: saveVersion._id,
    payloadHash,
    createdAt: saveVersion.createdAt,
  });
}

/**
 * GET /v1/games/:gameId/saves/:slotKey/latest
 *
 * Return the most recent save for this slot (full payload included).
 */
export async function getLatestSave(req, res) {
  const { gameId, slotKey } = req.params;
  const playerId = req.player.id;

  const slot = await SaveSlot.findOne({ gameId, playerId, slotKey });
  if (!slot) {
    return res.status(404).json({
      success: false,
      message: 'No save found for this slot',
    });
  }

  const save = await SaveVersion.findOne({ slotId: slot._id })
    .sort({ version: -1 })
    .lean();

  if (!save) {
    return res.status(404).json({
      success: false,
      message: 'No save version found',
    });
  }

  return res.status(200).json({
    success: true,
    save: {
      id: save._id,
      version: save.version,
      payload: save.payload,
      payloadHash: save.payloadHash,
      clientBuild: save.clientBuild,
      createdAt: save.createdAt,
    },
  });
}

/**
 * GET /v1/games/:gameId/saves/:slotKey
 *
 * List version metadata for this slot (without payloads).
 *
 * Query: limit (default 50, max 101), before (ISO timestamp cursor)
 */
export async function listVersions(req, res) {
  const { gameId, slotKey } = req.params;
  const { limit = 50, before } = req.query;
  const playerId = req.player.id;

  const slot = await SaveSlot.findOne({ gameId, playerId, slotKey });
  if (!slot) {
    return res.status(404).json({
      success: false,
      message: 'No save found for this slot',
    });
  }

  const limitNum = Math.min(MAX_VERSIONS, Math.max(1, parseInt(limit, 10) || 50));
  const filter = { slotId: slot._id };

  if (before) {
    const d = new Date(before);
    if (!isNaN(d)) filter.createdAt = { $lt: d };
  }

  const versions = await SaveVersion.find(filter)
    .sort({ version: -1 })
    .limit(limitNum)
    .select('-payload')
    .lean();

  return res.status(200).json({
    success: true,
    slotKey,
    currentVersion: slot.currentVersion,
    versions: versions.map((v) => ({
      id: v._id,
      version: v.version,
      payloadHash: v.payloadHash,
      clientBuild: v.clientBuild,
      createdAt: v.createdAt,
    })),
  });
}

/**
 * GET /v1/games/:gameId/saves/:slotKey/:version
 *
 * Return a specific version (full payload included).
 */
export async function getVersion(req, res) {
  const { gameId, slotKey, version } = req.params;
  const playerId = req.player.id;

  const versionNum = parseInt(version, 10);
  if (isNaN(versionNum) || versionNum < 1) {
    return res.status(400).json({
      success: false,
      message: 'Invalid version number',
    });
  }

  const slot = await SaveSlot.findOne({ gameId, playerId, slotKey });
  if (!slot) {
    return res.status(404).json({
      success: false,
      message: 'No save found for this slot',
    });
  }

  const save = await SaveVersion.findOne({
    slotId: slot._id,
    version: versionNum,
  }).lean();

  if (!save) {
    return res.status(404).json({
      success: false,
      message: 'Version not found',
    });
  }

  return res.status(200).json({
    success: true,
    save: {
      id: save._id,
      version: save.version,
      payload: save.payload,
      payloadHash: save.payloadHash,
      clientBuild: save.clientBuild,
      createdAt: save.createdAt,
    },
  });
}
