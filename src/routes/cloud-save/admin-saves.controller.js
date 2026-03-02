import crypto from 'crypto';
import { Game } from './game.model.js';
import { Player } from './player.model.js';
import { SaveSlot } from './saveSlot.model.js';
import { SaveVersion } from './saveVersion.model.js';

const MAX_VERSIONS = 101;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildDateFilter(from, to) {
  if (!from && !to) return {};
  const dateFilter = {};
  if (from) {
    const d = new Date(from);
    if (!isNaN(d)) dateFilter.$gte = d;
  }
  if (to) {
    const d = new Date(to);
    if (!isNaN(d)) dateFilter.$lte = d;
  }
  return Object.keys(dateFilter).length ? { createdAt: dateFilter } : {};
}

// ─── JSON API controllers ────────────────────────────────────────────────────

/**
 * GET /admin/games
 */
export async function listGames(_req, res) {
  const games = await Game.find().sort({ name: 1 }).lean();
  return res.status(200).json({ success: true, games });
}

/**
 * POST /admin/games
 * Body: { slug, name }
 */
export async function createGame(req, res) {
  const { slug, name } = req.body ?? {};

  if (!slug || !name) {
    return res.status(400).json({
      success: false,
      message: '`slug` and `name` are required',
    });
  }

  const normalized = slug.toLowerCase().trim().slice(0, 100);

  const existing = await Game.findOne({ slug: normalized });
  if (existing) {
    return res.status(409).json({
      success: false,
      message: 'Game with this slug already exists',
    });
  }

  const game = await Game.create({ slug: normalized, name: name.trim().slice(0, 200) });
  return res.status(201).json({ success: true, game });
}

/**
 * GET /admin/games/:gameId/saves
 * Query: playerId, slotKey, from, to, limit, page
 */
export async function listSaves(req, res) {
  const { gameId } = req.params;
  const { playerId, slotKey, from, to, limit = 100, page = 1 } = req.query;

  const filter = { gameId };
  if (playerId) filter.playerId = playerId;
  if (slotKey) filter.slotKey = slotKey;

  const dateFilter = buildDateFilter(from, to);
  if (dateFilter.createdAt) filter.createdAt = dateFilter.createdAt;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 100));
  const skip = (pageNum - 1) * limitNum;

  const [slots, total] = await Promise.all([
    SaveSlot.find(filter)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate('playerId', 'username email')
      .populate('gameId', 'slug name')
      .lean(),
    SaveSlot.countDocuments(filter),
  ]);

  return res.status(200).json({
    success: true,
    total,
    page: pageNum,
    limit: limitNum,
    pages: Math.ceil(total / limitNum),
    slots,
  });
}

/**
 * GET /admin/save-versions/:id
 */
export async function inspectVersion(req, res) {
  const { id } = req.params;

  const version = await SaveVersion.findById(id)
    .populate({
      path: 'slotId',
      populate: [
        { path: 'gameId', select: 'slug name' },
        { path: 'playerId', select: 'username email' },
      ],
    })
    .lean();

  if (!version) {
    return res.status(404).json({
      success: false,
      message: 'Version not found',
    });
  }

  return res.status(200).json({ success: true, version });
}

/**
 * DELETE /admin/save-versions/:id
 */
export async function deleteVersion(req, res) {
  const { id } = req.params;

  const version = await SaveVersion.findByIdAndDelete(id);
  if (!version) {
    return res.status(404).json({
      success: false,
      message: 'Version not found',
    });
  }

  return res.status(200).json({ success: true, message: 'Version deleted' });
}

/**
 * DELETE /admin/save-slots/:id
 */
export async function deleteSlot(req, res) {
  const { id } = req.params;

  const slot = await SaveSlot.findByIdAndDelete(id);
  if (!slot) {
    return res.status(404).json({
      success: false,
      message: 'Slot not found',
    });
  }

  // Delete all versions belonging to this slot
  await SaveVersion.deleteMany({ slotId: id });

  return res.status(200).json({
    success: true,
    message: 'Slot and all its versions deleted',
  });
}

/**
 * POST /admin/save-versions/:id/restore
 *
 * Creates a *new* latest version whose payload is copied from version :id.
 */
export async function restoreVersion(req, res) {
  const { id } = req.params;

  const source = await SaveVersion.findById(id).lean();
  if (!source) {
    return res.status(404).json({
      success: false,
      message: 'Source version not found',
    });
  }

  // Atomically increment slot version
  const slot = await SaveSlot.findByIdAndUpdate(
    source.slotId,
    { $inc: { currentVersion: 1 } },
    { new: true },
  );

  if (!slot) {
    return res.status(404).json({
      success: false,
      message: 'Save slot not found',
    });
  }

  const newVersion = slot.currentVersion;
  const payloadStr = JSON.stringify(source.payload);
  const payloadHash = crypto
    .createHash('sha256')
    .update(payloadStr)
    .digest('hex');

  const restored = await SaveVersion.create({
    slotId: slot._id,
    version: newVersion,
    payload: source.payload,
    payloadHash,
    clientBuild: source.clientBuild,
  });

  // Prune
  const cutoffVersion = newVersion - MAX_VERSIONS;
  if (cutoffVersion > 0) {
    await SaveVersion.deleteMany({
      slotId: slot._id,
      version: { $lte: cutoffVersion },
    });
  }

  return res.status(201).json({
    success: true,
    message: `Restored version ${source.version} as new version ${newVersion}`,
    version: {
      id: restored._id,
      version: restored.version,
      payloadHash: restored.payloadHash,
      createdAt: restored.createdAt,
    },
  });
}

// ─── Dashboard view controllers ──────────────────────────────────────────────

/**
 * GET /dashboard/saves
 * Main saves browser: game picker, slot listing with filters.
 */
export async function viewSaves(req, res, next) {
  try {
    const { gameId, playerId, slotKey } = req.query;

    const games = await Game.find().sort({ name: 1 }).lean();

    let slots = [];
    let selectedGame = null;

    if (gameId) {
      selectedGame = games.find((g) => g._id.toString() === gameId) || null;

      const filter = { gameId };
      if (playerId) filter.playerId = playerId;
      if (slotKey) filter.slotKey = slotKey;

      slots = await SaveSlot.find(filter)
        .sort({ updatedAt: -1 })
        .limit(200)
        .populate('playerId', 'username email')
        .lean();
    }

    const [totalGames, totalPlayers, totalSlots, totalVersions] =
      await Promise.all([
        Game.countDocuments(),
        Player.countDocuments(),
        SaveSlot.countDocuments(),
        SaveVersion.countDocuments(),
      ]);

    const players = await Player.find()
      .select('username email')
      .sort({ username: 1 })
      .lean();

    res.render('dashboard-saves', {
      games,
      selectedGame,
      slots,
      players,
      filters: {
        gameId: gameId || '',
        playerId: playerId || '',
        slotKey: slotKey || '',
      },
      stats: { totalGames, totalPlayers, totalSlots, totalVersions },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /dashboard/saves/slot/:slotId
 * Version history for a specific slot.
 */
export async function viewSlotVersions(req, res, next) {
  try {
    const { slotId } = req.params;

    const slot = await SaveSlot.findById(slotId)
      .populate('gameId', 'slug name')
      .populate('playerId', 'username email')
      .lean();

    if (!slot) {
      return res.status(404).render('dashboard-saves-detail', {
        slot: null,
        versions: [],
        error: 'Slot not found',
      });
    }

    const versions = await SaveVersion.find({ slotId: slot._id })
      .sort({ version: -1 })
      .lean();

    res.render('dashboard-saves-detail', { slot, versions, error: null });
  } catch (err) {
    next(err);
  }
}
