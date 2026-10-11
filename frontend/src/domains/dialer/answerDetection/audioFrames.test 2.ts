import { test } from "node:test";
import assert from "node:assert/strict";
import { FrameClassifier, rms, toneStrength } from "./audioFrames";

const RATE = 48000;
const N = 2048;

function sine(freq: number, amp: number, n = N, phase = 0): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * freq * i) / RATE + phase);
  return out;
}

/** Deterministic pseudo-noise (no Math.random: tests must not flake). */
function noise(amp: number, n = N, seed = 1): Float32Array {
  let s = seed;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    s = (s * 1664525 + 1013904223) % 4294967296;
    out[i] = amp * ((s / 4294967296) * 2 - 1);
  }
  return out;
}

function add(...parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts[0].length);
  for (const p of parts) for (let i = 0; i < out.length; i++) out[i] += p[i];
  return out;
}

/** Speech-like: a 140 Hz voice with its harmonics, a little breath noise. */
function voice(amp = 0.12): Float32Array {
  const parts = [1, 2, 3, 4, 5, 6, 7, 8].map((h) => sine(140 * h, amp / h));
  return add(...parts, noise(amp * 0.05));
}

test("rms of a sine is amplitude over root two", () => {
  assert.ok(Math.abs(rms(sine(1000, 0.5)) - 0.5 / Math.SQRT2) < 0.01);
  assert.equal(rms(new Float32Array(0)), 0);
});

test("a pure beep scores as a tone, at several pitches and phases", () => {
  for (const freq of [440, 850, 1000, 1337, 1800]) {
    for (const phase of [0, 1.1, 2.6]) {
      const { ratio } = toneStrength(sine(freq, 0.3, N, phase), RATE);
      assert.ok(ratio > 0.7, `${freq} Hz phase ${phase}: ${ratio.toFixed(2)}`);
    }
  }
});

test("a beep still scores as a tone on a noisy line", () => {
  const { ratio } = toneStrength(add(sine(1000, 0.25), noise(0.02)), RATE);
  assert.ok(ratio > 0.6, `ratio ${ratio.toFixed(2)}`);
});

test("speech and noise do not score as a tone", () => {
  assert.ok(toneStrength(voice(), RATE).ratio < 0.5, "voice");
  assert.ok(toneStrength(noise(0.2), RATE).ratio < 0.2, "noise");
  assert.equal(toneStrength(new Float32Array(N), RATE).ratio, 0);
});

test("two keypad tones together are not a single beep", () => {
  const dtmf = add(sine(697, 0.2), sine(1209, 0.2));
  assert.ok(toneStrength(dtmf, RATE).ratio < 0.6);
});

test("classifier: silence and line hiss are not speech", () => {
  const c = new FrameClassifier();
  const f1 = c.classify(new Float32Array(N), RATE, 40);
  const f2 = c.classify(noise(0.004), RATE, 80);
  assert.deepEqual([f1.voiced, f1.tone, f2.voiced, f2.tone], [false, false, false, false]);
});

test("classifier: speech is voiced, a beep is a tone and not voiced", () => {
  const c = new FrameClassifier();
  for (let i = 0; i < 10; i++) c.classify(noise(0.003, N, i + 1), RATE, i * 40); // learn the floor
  const speech = c.classify(voice(), RATE, 440);
  assert.equal(speech.voiced, true);
  assert.equal(speech.tone, false);
  const beep = c.classify(sine(1000, 0.3), RATE, 480);
  assert.equal(beep.tone, true);
  assert.equal(beep.voiced, false);
});

test("classifier: a noisy line is not mistaken for speech after the floor is learned", () => {
  const c = new FrameClassifier();
  let any = false;
  for (let i = 0; i < 60; i++) any ||= c.classify(noise(0.009, N, i + 7), RATE, i * 40).voiced;
  assert.equal(any, false);
});

test("classifier: steady line noise well above the minimum is not speech, from the very first frames", () => {
  const c = new FrameClassifier();
  let voiced = 0;
  for (let i = 0; i < 150; i++) if (c.classify(noise(0.035, N, i + 3), RATE, i * 40).voiced) voiced++;
  assert.equal(voiced, 0, "constant noise at rms ~0.02 must never count as talking");
});

test("classifier: speech over steady noise is still heard", () => {
  const c = new FrameClassifier();
  for (let i = 0; i < 20; i++) c.classify(noise(0.035, N, i + 3), RATE, i * 40);
  assert.equal(c.classify(add(voice(0.2), noise(0.035, N, 99)), RATE, 900).voiced, true);
});

test("classifier: speech that starts the moment the call opens is heard at once", () => {
  const c = new FrameClassifier();
  assert.equal(c.classify(voice(0.2), RATE, 0).voiced, true);
});
