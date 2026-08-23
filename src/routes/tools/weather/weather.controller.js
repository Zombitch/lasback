import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../../../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.join(__dirname, 'assets');

const RAIN_LOOP_FILE = 'rain-fx-inside-car.wav';
const THUNDER_FILE = 'boomy-thunder-shock.wav';

const WAV_CACHE_HEADERS = {
  'Content-Type': 'audio/wav',
  'Cache-Control': 'public, max-age=3600',
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

function serveWavAsset(filename, res) {
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

export function renderWeather(req, res) {
  res.render('weather');
}

export function serveRainSound(req, res) {
  serveWavAsset(RAIN_LOOP_FILE, res);
}

export function serveThunderSound(req, res) {
  serveWavAsset(THUNDER_FILE, res);
}
