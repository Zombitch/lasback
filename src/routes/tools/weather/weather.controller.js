import { getRainDropVariant, getRainBedWav, getThunderWav, DROP_VARIANT_COUNT } from './audioSynth.js';

const WAV_CACHE_HEADERS = {
  'Content-Type': 'audio/wav',
  'Cache-Control': 'public, max-age=3600',
};

export function renderWeather(req, res) {
  res.render('weather', { dropVariantCount: DROP_VARIANT_COUNT });
}

export function serveDropVariant(req, res) {
  const index = Number.parseInt(req.params.index, 10);
  if (!Number.isInteger(index) || index < 0 || index >= DROP_VARIANT_COUNT) {
    return res.status(404).end();
  }
  res.set(WAV_CACHE_HEADERS);
  res.send(getRainDropVariant(index));
}

export function serveRainBedSound(req, res) {
  res.set(WAV_CACHE_HEADERS);
  res.send(getRainBedWav());
}

export function serveThunderSound(req, res) {
  res.set(WAV_CACHE_HEADERS);
  res.send(getThunderWav());
}
