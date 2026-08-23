import { getRainDropWav, getThunderWav } from './audioSynth.js';

export function renderWeather(req, res) {
  res.render('weather');
}

export function serveDropSound(req, res) {
  res.set({
    'Content-Type': 'audio/wav',
    'Cache-Control': 'public, max-age=3600',
  });
  res.send(getRainDropWav());
}

export function serveThunderSound(req, res) {
  res.set({
    'Content-Type': 'audio/wav',
    'Cache-Control': 'public, max-age=3600',
  });
  res.send(getThunderWav());
}
