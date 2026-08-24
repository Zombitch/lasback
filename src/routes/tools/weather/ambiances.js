/**
 * Single source of truth for every weather ambiance — same pattern as
 * home/api-registry.js. Adding a new ambiance means adding an entry here
 * (and, once real recordings exist, dropping files into ./assets and
 * naming them under `sounds`); nothing else needs to know the full list.
 *
 * `sounds.loop` / `sounds.accent` are optional and deliberately omitted for
 * ambiances that don't have real audio yet — the client only ever fetches
 * a sound URL for a role that's actually declared here, so an ambiance
 * with no `sounds` at all is simply silent, not broken.
 *
 * `particleType` selects which client-side particle system renders the
 * ambiance: 'rain' (falling streaks + puddle ripples), 'snow' (soft
 * drifting flakes), or 'wind' (blowing dust/sand, no falling).
 *
 * `skyColors` are the three stops of the sky's radial gradient
 * (top/mid/bottom) — the only visual thing that's actually per-ambiance
 * besides the particles; the warm cocoon vignette stays identical across
 * all of them on purpose, since "safe inside while X happens outside" is
 * the one constant.
 */
export const ambiances = {
  'car-rain': {
    id: 'car-rain',
    name: 'En voiture, sous la pluie',
    cardText: 'Le tambourinement de la pluie sur le toit, à l’abri.',
    caption: 'Restons dans notre cocon, pendant que le temps se déchaîne dehors.',
    particleType: 'rain',
    hasLightning: true,
    skyColors: ['#2a3550', '#131a2c', '#05070d'],
    sounds: {
      loop: 'rain-fx-inside-car.wav',
      accent: 'boomy-thunder-shock.wav',
    },
  },
  snow: {
    id: 'snow',
    name: 'Nuit de neige',
    cardText: 'Flocons silencieux, nuit calme et froide.',
    caption: 'Le silence blanc s’installe, pendant que nous restons au chaud.',
    particleType: 'snow',
    hasLightning: false,
    skyColors: ['#3a4a68', '#1c2438', '#05070d'],
    sounds: {},
  },
  'forest-rain': {
    id: 'forest-rain',
    name: 'Pluie en forêt',
    cardText: 'Une pluie douce, filtrée par les arbres.',
    caption: 'La pluie glisse entre les feuilles, la forêt respire.',
    particleType: 'rain',
    hasLightning: false,
    skyColors: ['#2a3a2e', '#16241a', '#05070d'],
    sounds: {},
  },
  'desert-wind': {
    id: 'desert-wind',
    name: 'Vent du désert',
    cardText: 'Un vent sec et lointain, sous un ciel nocturne.',
    caption: 'Le vent balaie les dunes, mais ici, rien ne bouge.',
    particleType: 'wind',
    hasLightning: false,
    skyColors: ['#2a3040', '#181c28', '#05070d'],
    sounds: {},
  },
};

export function getAmbiance(id) {
  return Object.prototype.hasOwnProperty.call(ambiances, id) ? ambiances[id] : null;
}

export function listAmbiances() {
  return Object.values(ambiances);
}
