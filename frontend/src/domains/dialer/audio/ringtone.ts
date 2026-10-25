let audioCtx: AudioContext | null = null;
let ringInterval: ReturnType<typeof setInterval> | null = null;
let isRinging = false;

export interface RingtoneOptions {
  frequencies?: [number, number]; // Defaults to Australian/UK cadence 400Hz & 450Hz
  volume?: number;
}

/**
 * Plays one dual-tone burst.
 */
function playToneBurst(ctx: AudioContext, f1: number, f2: number, durationSec: number, volume: number): void {
  const now = ctx.currentTime;
  const gainNode = ctx.createGain();
  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(volume, now + 0.05);
  gainNode.gain.setValueAtTime(volume, now + durationSec - 0.05);
  gainNode.gain.linearRampToValueAtTime(0, now + durationSec);
  gainNode.connect(ctx.destination);

  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();

  osc1.type = "sine";
  osc2.type = "sine";
  osc1.frequency.setValueAtTime(f1, now);
  osc2.frequency.setValueAtTime(f2, now);

  osc1.connect(gainNode);
  osc2.connect(gainNode);

  osc1.start(now);
  osc2.start(now);

  osc1.stop(now + durationSec);
  osc2.stop(now + durationSec);
}

/**
 * Standard Australian double-burst ring:
 * Ring (0.4s) -> Silence (0.2s) -> Ring (0.4s) -> Silence (2.0s). Cycle = 3.0s.
 */
function playRingCycle(ctx: AudioContext, f1: number, f2: number, volume: number): void {
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
  // First burst
  playToneBurst(ctx, f1, f2, 0.4, volume);
  // Second burst after 0.6s
  setTimeout(() => {
    if (isRinging && audioCtx && audioCtx.state !== "closed") {
      playToneBurst(audioCtx, f1, f2, 0.4, volume);
    }
  }, 600);
}

/**
 * Starts audible telephone ringing. Safe across browser auto-play policies.
 */
export function startRingtone(options: RingtoneOptions = {}): boolean {
  if (typeof window === "undefined") return false;
  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return false;

  stopRingtone();
  isRinging = true;

  try {
    audioCtx = new AudioContextClass();
  } catch {
    return false;
  }

  const [f1, f2] = options.frequencies ?? [400, 450];
  const volume = Math.max(0, Math.min(1, options.volume ?? 0.25));

  playRingCycle(audioCtx, f1, f2, volume);
  ringInterval = setInterval(() => {
    if (isRinging && audioCtx && audioCtx.state !== "closed") {
      playRingCycle(audioCtx, f1, f2, volume);
    }
  }, 3000);

  return true;
}

/**
 * Stops audible ringing and releases audio resources immediately.
 */
export function stopRingtone(): void {
  isRinging = false;
  if (ringInterval) {
    clearInterval(ringInterval);
    ringInterval = null;
  }
  if (audioCtx) {
    try {
      audioCtx.close().catch(() => {});
    } catch {
      // Ignored
    }
    audioCtx = null;
  }
}

export function isRingtonePlaying(): boolean {
  return isRinging;
}
