import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../../../utils/logger.js';
import { getAmbiance, listAmbiances } from './ambiances.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.join(__dirname, 'assets');

const IMAGE_CONTENT_TYPES = {
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};

// Safe to cache aggressively/indefinitely because the URL is versioned
// (?v=<mtime>) — swapping the underlying file changes the URL the view
// requests, so browsers never serve a stale asset from a previous deploy.
const LONG_CACHE_CONTROL = 'public, max-age=31536000, immutable';

// Read once per server lifetime and reused for every request — no reason
// to hit disk on every hit of an unauthenticated route.
const assetCache = new Map();

function loadAsset(filename) {
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
  const ambiances = listAmbiances().filter((ambiance) => ambiance.id === 'forest-rain');
  res.render('weather-home', { ambiances });
}

export function renderScene(req, res, next) {
  const ambiance = getAmbiance(req.params.ambianceId);
  if (!ambiance) return next();

  const soundVersions = {};
  for (const role of Object.keys(ambiance.sounds)) {
    soundVersions[role] = getAssetVersion(ambiance.sounds[role]);
  }

  const imageVersions = {};
  for (const role of Object.keys(ambiance.images)) {
    imageVersions[role] = getAssetVersion(ambiance.images[role]);
  }

  res.render('weather-scene', { ambiance, soundVersions, imageVersions });
}

export function serveAmbianceSound(req, res) {
  const ambiance = getAmbiance(req.params.ambianceId);
  const role = req.params.role;
  const hasRole = ambiance && Object.prototype.hasOwnProperty.call(ambiance.sounds, role);
  const filename = hasRole ? ambiance.sounds[role] : null;
  if (!filename) return res.status(404).end();

  let buffer;
  try {
    buffer = loadAsset(filename);
  } catch (err) {
    logger.error({ err, filename }, '[WEATHER] Missing/unreadable audio asset');
    return res.status(503).json({
      success: false,
      message: 'Weather sound asset is not available on this server.',
    });
  }

  res.set({ 'Content-Type': 'audio/wav', 'Cache-Control': LONG_CACHE_CONTROL });
  res.send(buffer);
}

export function serveAmbianceImage(req, res) {
  const ambiance = getAmbiance(req.params.ambianceId);
  const role = req.params.role;
  const hasRole = ambiance && Object.prototype.hasOwnProperty.call(ambiance.images, role);
  const filename = hasRole ? ambiance.images[role] : null;
  if (!filename) return res.status(404).end();

  let buffer;
  try {
    buffer = loadAsset(filename);
  } catch (err) {
    logger.error({ err, filename }, '[WEATHER] Missing/unreadable background image asset');
    return res.status(503).json({
      success: false,
      message: 'Background image asset is not available on this server.',
    });
  }

  const contentType = IMAGE_CONTENT_TYPES[path.extname(filename).toLowerCase()] || 'application/octet-stream';
  res.set({ 'Content-Type': contentType, 'Cache-Control': LONG_CACHE_CONTROL });
  res.send(buffer);
}
