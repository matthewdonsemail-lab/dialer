import type { AudioFrame } from "./answerAnalyzer";

/**
 * Sample buffers to AudioFrames: how loud, and is it a steady tone. Pure
 * math on Float32Array, so it is unit tested with generated sounds; the
 * probe that feeds it real call audio is remoteAudioProbe.ts.
 */

/** Root-mean-square level, 0 to 1. */
export function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

const hannCache = new Map<number, { w: Float32Array; sum: number; sumSq: number }>();
function hann(n: number) {
  let h = hannCache.get(n);
  if (!h) {
    const w = new Float32Array(n);
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
      sum += w[i];
      sumSq += w[i] * w[i];
    }
    h = { w, sum, sumSq };
    hannCache.set(n, h);
  }
  return h;
}

/** Voicemail beeps sit in this band; search it in 25 Hz steps. */
const TONE_BAND_HZ: [number, number] = [350, 2200];
const TONE_STEP_HZ = 25;

export interface ToneStrength {
  freq: number;
  /** Share of the frame's energy in one steady tone: ~1 for a pure beep, low for speech and noise. */
  ratio: number;
}

/**
 * The strongest steady tone in the frame (Goertzel at 25 Hz steps over the
 * beep band, Hann windowed). For a pure sine the ratio is about 1; speech
 * spreads its energy across harmonics and noise across the band, so both
 * score low.
 */
export function toneStrength(samples: Float32Array, sampleRate: number): ToneStrength {
  const n = samples.length;
  if (n < 64) return { freq: 0, ratio: 0 };
  const { w, sum, sumSq } = hann(n);
  const windowed = new Float32Array(n);
  let energy = 0;
  for (let i = 0; i < n; i++) {
    windowed[i] = samples[i] * w[i];
    energy += windowed[i] * windowed[i];
  }
  if (energy < 1e-9) return { freq: 0, ratio: 0 };

  let bestPower = 0;
  let bestFreq = 0;
  for (let f = TONE_BAND_HZ[0]; f <= TONE_BAND_HZ[1]; f += TONE_STEP_HZ) {
    const coeff = 2 * Math.cos((2 * Math.PI * f) / sampleRate);
    let s1 = 0;
    let s2 = 0;
    for (let i = 0; i < n; i++) {
      const s0 = windowed[i] + coeff * s1 - s2;
      s2 = s1;
      s1 = s0;
    }
    const power = s1 * s1 + s2 * s2 - coeff * s1 * s2;
    if (power > bestPower) {
      bestPower = power;
      bestFreq = f;
    }
  }
  // Tone mean-square = 2|X|^2 / (sum w)^2; total = energy / (sum w^2).
  const toneMs = (2 * bestPower) / (sum * sum);
  const totalMs = energy / sumSq;
  return { freq: bestFreq, ratio: Math.min(1, toneMs / totalMs) };
}

export interface ClassifierConfig {
  /** Below this level a frame is never speech (comfort noise, hiss). */
  minVoicedRms: number;
  /** Speech must be this many times louder than the tracked noise floor. */
  floorMultiple: number;
  /** The noise floor is the quietest level over this long, so steady noise is learned in seconds. */
  floorWindowMs: number;
  /** The floor never counts as louder than this, so a very loud first sound is still heard as speech. */
  maxFloor: number;
  /** A frame this tonal, and loud enough, is a beep. */
  toneRatio: number;
}

export const DEFAULT_CLASSIFIER_CONFIG: ClassifierConfig = {
  minVoicedRms: 0.01,
  floorMultiple: 3,
  floorWindowMs: 3000,
  maxFloor: 0.02,
  toneRatio: 0.6,
};

/**
 * Turns one buffer at a time into an AudioFrame, tracking the line's noise
 * floor so a hissy line is not mistaken for speech. A tone frame is never
 * also voiced, so a beep is not counted as talking.
 */
export class FrameClassifier {
  private readonly cfg: ClassifierConfig;
  private recent: Array<{ t: number; level: number }> = [];

  constructor(config: Partial<ClassifierConfig> = {}) {
    this.cfg = { ...DEFAULT_CLASSIFIER_CONFIG, ...config };
  }

  classify(samples: Float32Array, sampleRate: number, t: number): AudioFrame {
    const level = rms(samples);
    // The floor is the quietest moment of the last few seconds: a line with steady noise (a
    // street, a car, hiss) is learned within the window and is not mistaken for someone talking.
    this.recent.push({ t, level });
    while (this.recent.length > 1 && t - this.recent[0].t > this.cfg.floorWindowMs) this.recent.shift();
    let floor = this.cfg.maxFloor;
    for (const r of this.recent) if (r.level < floor) floor = r.level;
    const loud = level >= this.cfg.minVoicedRms && level >= floor * this.cfg.floorMultiple;
    const tone = loud && toneStrength(samples, sampleRate).ratio >= this.cfg.toneRatio;
    return { t, voiced: loud && !tone, tone };
  }
}
