import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../../../utils/logger.js';
import { getAmbiance, listAmbiances } from './ambiances.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.join(__dirname, 'assets');

const WAV_CACHE_HEADERS = {
  'Content-Type': 'audio/wav',
  // Safe to cache aggressively/indefinitely because the URL is versioned
  // (?v=<mtime>) — swapping the underlying file changes the URL the view
  // requests, so browsers never serve a stale asset from a previous deploy.
  'Cache-Control': 'public, max-age=31536000, immutable',
};

// Read once per server lifetime and reused for every request — no reason
// to hit disk on every hit of an unauthenticated route.
const assetCache = new Map();

function loadWavAsset(filename) {
  if (assetCache.has(filename)) return assetCache.get(filename);

  const filePath = path.join(ASSETS_DIR, filename);
  const buffer = fs.readFileSync(filePath);
  assetCache.set(filename, buffer);
  return buffer;
}

// Used only to version the URLs the view fetches, so a redeployed asset
// gets a new URL instead of being masked by a previous long-lived cache.
// Falls back to the server start time when the file can't be stat'd, which
// just means the URL changes on every restart instead of every file swap —
// harmless, and keeps rendering the page even if the asset is missing.
const serverStartVersion = String(Date.now());
function getAssetVersion(filename) {
  try {
    return String(fs.statSync(path.join(ASSETS_DIR, filename)).mtimeMs);
  } catch {
    return serverStartVersion;
  }
}

export function renderHome(req, res) {
  res.render('weather-home', { ambiances: listAmbiances() });
}

export function renderScene(req, res, next) {
  const ambiance = getAmbiance(req.params.ambianceId);
  if (!ambiance) return next();

  const soundVersions = {};
  for (const role of Object.keys(ambiance.sounds)) {
    soundVersions[role] = getAssetVersion(ambiance.sounds[role]);
  }

  res.render('weather-scene', { ambiance, soundVersions });
}

export function serveAmbianceSound(req, res) {
  const ambiance = getAmbiance(req.params.ambianceId);
  const role = req.params.role;
  const hasRole = ambiance && Object.prototype.hasOwnProperty.call(ambiance.sounds, role);
  const filename = hasRole ? ambiance.sounds[role] : null;
  if (!filename) return res.status(404).end();

  let buffer;
  try {
    buffer = loadWavAsset(filename);
  } catch (err) {
    logger.error({ err, filename }, '[WEATHER] Missing/unreadable audio asset');
    return res.status(503).json({
      success: false,
      message: 'Weather sound asset is not available on this server.',
    });
  }

  res.set(WAV_CACHE_HEADERS);
  res.send(buffer);
}
