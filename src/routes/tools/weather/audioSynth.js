const SAMPLE_RATE = 22050;

/**
 * One-pole low-pass / high-pass filters. Cheap stand-ins for a real biquad —
 * good enough to turn white noise into a "rumble" or a "hiss" without pulling
 * in an audio DSP dependency.
 */
function lowpassFilter(samples, sampleRate, cutoffHz) {
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const dt = 1 / sampleRate;
  const alpha = dt / (rc + dt);
  const out = new Float64Array(samples.length);
  out[0] = samples[0];
  for (let i = 1; i < samples.length; i++) {
    out[i] = out[i - 1] + alpha * (samples[i] - out[i - 1]);
  }
  return out;
}

function highpassFilter(samples, sampleRate, cutoffHz) {
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const dt = 1 / sampleRate;
  const alpha = rc / (rc + dt);
  const out = new Float64Array(samples.length);
  out[0] = samples[0];
  for (let i = 1; i < samples.length; i++) {
    out[i] = alpha * (out[i - 1] + samples[i] - samples[i - 1]);
  }
  return out;
}

function normalize(samples, peak = 0.9) {
  let max = 0;
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > max) max = abs;
  }
  if (max === 0) return samples;
  const scale = peak / max;
  const out = new Float64Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] * scale;
  return out;
}

function encodeWavPCM16(samples, sampleRate) {
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16); // PCM fmt chunk size
  buffer.writeUInt16LE(1, 20); // audio format = PCM
  buffer.writeUInt16LE(1, 22); // channels = mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28); // byte rate (mono, 16-bit)
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataSize, 40);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    const intSample = Math.round(clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff);
    buffer.writeInt16LE(intSample, offset);
    offset += 2;
  }
  return buffer;
}

/**
 * Single droplet impact. Real rain never sounds like the same sample
 * replayed — every drop lands on a slightly different spot with a
 * different size, so each call randomizes not just pitch/length but the
 * actual timbre: the tone/noise balance, decay speed, and whether it rings
 * with a second inharmonic partial (glassy ping) or stays a duller thud.
 */
function synthesizeRainDropVariant(sampleRate) {
  const duration = 0.1 + Math.random() * 0.14;
  const n = Math.floor(duration * sampleRate);
  const baseFreq = 700 + Math.random() * 1400;
  const toneDecay = 20 + Math.random() * 35;
  const noiseDecay = 35 + Math.random() * 70;
  const toneMix = 0.35 + Math.random() * 0.5;
  const noiseMix = 1 - toneMix * 0.5;
  const hasPartial = Math.random() < 0.5;
  const partialRatio = 1.6 + Math.random() * 0.9;

  const noise = new Float64Array(n);
  for (let i = 0; i < n; i++) noise[i] = Math.random() * 2 - 1;
  const splash = lowpassFilter(noise, sampleRate, 2200 + Math.random() * 3000);

  const mixed = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    let tone = Math.sin(2 * Math.PI * baseFreq * Math.exp(-t * 8) * t) * Math.exp(-t * toneDecay);
    if (hasPartial) {
      tone += 0.4 * Math.sin(2 * Math.PI * baseFreq * partialRatio * t) * Math.exp(-t * toneDecay * 1.8);
    }
    mixed[i] = tone * toneMix + splash[i] * Math.exp(-t * noiseDecay) * noiseMix;
  }

  return encodeWavPCM16(normalize(mixed, 0.85), sampleRate);
}

/**
 * Continuous rain "bed": band-limited noise, seamlessly loopable, with a
 * slow multi-sine amplitude modulation so it breathes like gusts of rain
 * instead of sounding like a flat, static hiss. This is the layer that
 * actually reads as "rain" — individual drop plinks are just texture on
 * top of it, the same way real rain-ambience recordings are built.
 */
function synthesizeRainBed(sampleRate, durationSeconds) {
  const n = Math.floor(durationSeconds * sampleRate);

  const raw = new Float64Array(n);
  for (let i = 0; i < n; i++) raw[i] = Math.random() * 2 - 1;

  // Crossfade the tail into the head so the loop point has no seam/click.
  const fadeLen = Math.floor(sampleRate * 0.4);
  for (let i = 0; i < fadeLen; i++) {
    const w = i / fadeLen;
    const idx = n - fadeLen + i;
    raw[idx] = raw[idx] * (1 - w) + raw[i] * w;
  }

  const bandLimited = lowpassFilter(highpassFilter(raw, sampleRate, 200), sampleRate, 4500);

  const phase1 = Math.random() * Math.PI * 2;
  const phase2 = Math.random() * Math.PI * 2;
  const phase3 = Math.random() * Math.PI * 2;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    // Frequencies are whole multiples of 1/duration so the modulation
    // itself loops perfectly regardless of the noise crossfade above.
    const modulation =
      0.82 +
      0.09 * Math.sin((2 * Math.PI * 1 * t) / durationSeconds + phase1) +
      0.06 * Math.sin((2 * Math.PI * 3 * t) / durationSeconds + phase2) +
      0.03 * Math.sin((2 * Math.PI * 7 * t) / durationSeconds + phase3);
    out[i] = bandLimited[i] * modulation;
  }

  return encodeWavPCM16(normalize(out, 0.7), sampleRate);
}

/**
 * Rolling thunder: a sharp high-passed "crack" transient up front, followed
 * by a few overlapping low-passed rumble bumps (gaussian envelopes) so it
 * sounds like it rolls rather than just fading out in a straight line.
 */
function synthesizeThunder(sampleRate) {
  const duration = 3 + Math.random() * 1.5;
  const n = Math.floor(duration * sampleRate);

  const raw = new Float64Array(n);
  for (let i = 0; i < n; i++) raw[i] = Math.random() * 2 - 1;

  const rumble = lowpassFilter(raw, sampleRate, 120 + Math.random() * 80);
  const crack = highpassFilter(raw, sampleRate, 800);

  const envelope = new Float64Array(n);
  for (let i = 0; i < n; i++) envelope[i] = Math.exp(-(i / sampleRate) * 10);

  const bumpCount = 3 + Math.floor(Math.random() * 3);
  for (let b = 0; b < bumpCount; b++) {
    const center = duration * 0.15 + Math.random() * duration * 0.8;
    const width = 0.3 + Math.random() * 0.5;
    const amp = 0.4 + Math.random() * 0.6;
    for (let i = 0; i < n; i++) {
      const t = i / sampleRate;
      const d = (t - center) / width;
      envelope[i] += amp * Math.exp(-d * d * 4);
    }
  }

  let maxEnv = 0;
  for (let i = 0; i < n; i++) if (envelope[i] > maxEnv) maxEnv = envelope[i];

  const mixed = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    mixed[i] = rumble[i] * (envelope[i] / maxEnv) * 0.9 + crack[i] * Math.exp(-t * 15) * 0.6;
  }

  return encodeWavPCM16(normalize(mixed, 0.9), sampleRate);
}

export const DROP_VARIANT_COUNT = 8;
const RAIN_BED_DURATION_SECONDS = 6;

// Generated once per server lifetime and reused for every request — an
// unauthenticated route has no business re-running DSP synthesis per hit.
let cachedDropVariants = null;
let cachedRainBedWav = null;
let cachedThunderWav = null;

export function getRainDropVariant(index) {
  if (!cachedDropVariants) {
    cachedDropVariants = [];
    for (let i = 0; i < DROP_VARIANT_COUNT; i++) {
      cachedDropVariants.push(synthesizeRainDropVariant(SAMPLE_RATE));
    }
  }
  const safeIndex = ((index % DROP_VARIANT_COUNT) + DROP_VARIANT_COUNT) % DROP_VARIANT_COUNT;
  return cachedDropVariants[safeIndex];
}

export function getRainBedWav() {
  if (!cachedRainBedWav) cachedRainBedWav = synthesizeRainBed(SAMPLE_RATE, RAIN_BED_DURATION_SECONDS);
  return cachedRainBedWav;
}

export function getThunderWav() {
  if (!cachedThunderWav) cachedThunderWav = synthesizeThunder(SAMPLE_RATE);
  return cachedThunderWav;
}
