/**
 * Who picked up: a person or an answering machine?
 *
 * Pure logic with no audio or timers, so it is unit tested on frame
 * sequences. A probe (remoteAudioProbe.ts) turns the call's incoming audio
 * into frames; this decides.
 *
 * What tells them apart, in the first seconds after pickup:
 *   - A person says a short greeting ("Hello?", "Joe's Autobody, how can I
 *     help?") and then WAITS: a pause of about a second.
 *   - A machine plays a recorded greeting that runs on, with only short
 *     pauses between sentences, and usually ends with a beep.
 *   - A steady tone (the beep) is a machine, whatever came before.
 * When the audio does not settle (silent pickup, noise) the answer is
 * "unsure", and the caller treats that as a person: connecting an operator
 * to a machine costs seconds, dropping a real person costs a lead.
 */

export interface AudioFrame {
  /** Milliseconds since the call was answered. Non-decreasing. */
  t: number;
  /** Speech-like energy above the line's noise floor. */
  voiced: boolean;
  /** A steady single tone, the kind a voicemail beep is. */
  tone: boolean;
}

export type Verdict = "human" | "machine" | "unsure";

export interface AnalyzerConfig {
  /** Silence after speech that ends a greeting: the caller is waiting for a reply. */
  endOfGreetingMs: number;
  /** Speech longer than this with no real pause is a recorded greeting. */
  machineSpeechMs: number;
  /** A tone this long counts as a beep. */
  beepMs: number;
  /** No sound at all for this long means a silent pickup. */
  silenceGiveUpMs: number;
  /** Give up deciding after this long and connect. */
  maxAnalysisMs: number;
}

export const DEFAULT_ANALYZER_CONFIG: AnalyzerConfig = {
  endOfGreetingMs: 900,
  machineSpeechMs: 4500,
  beepMs: 250,
  silenceGiveUpMs: 4500,
  maxAnalysisMs: 9000,
};

export type VerdictReason = "beep" | "long-greeting" | "short-greeting-then-pause" | "silent-pickup" | "timeout";

export interface Decision {
  verdict: Verdict;
  reason: VerdictReason;
  /** When it was decided, ms since pickup. */
  at: number;
}

export class AnswerAnalyzer {
  private readonly cfg: AnalyzerConfig;
  private prevT = 0;
  private silenceMs = 0;
  private toneMs = 0;
  /** When speech started and when it was last heard. A greeting is measured as this span, not as the
   *  sum of voiced frames: real speech is full of tiny gaps between words and syllables. */
  private speechStartT: number | null = null;
  private lastVoicedT = 0;
  private decision: Decision | null = null;

  constructor(config: Partial<AnalyzerConfig> = {}) {
    this.cfg = { ...DEFAULT_ANALYZER_CONFIG, ...config };
  }

  /** The decision once made, else null. Further frames never change it. */
  get result(): Decision | null {
    return this.decision;
  }

  /** How long the first speech has been going, first sound to last sound (0 before any speech). */
  get speechSpanMs(): number {
    return this.speechStartT === null ? 0 : this.lastVoicedT - this.speechStartT;
  }

  /** Feed the next frame. Returns the decision the moment it is made, else null. */
  push(frame: AudioFrame): Decision | null {
    if (this.decision) return null;
    const dt = Math.max(0, frame.t - this.prevT);
    this.prevT = frame.t;

    if (frame.tone) this.toneMs += dt;
    else this.toneMs = 0;
    if (frame.voiced) {
      this.speechStartT ??= frame.t;
      this.lastVoicedT = frame.t;
      this.silenceMs = 0;
    } else if (!frame.tone) {
      this.silenceMs += dt;
    }
    const heardSpeech = this.speechStartT !== null;

    if (this.toneMs >= this.cfg.beepMs) return this.decide("machine", "beep", frame.t);
    if (heardSpeech && this.silenceMs >= this.cfg.endOfGreetingMs) {
      return this.speechSpanMs <= this.cfg.machineSpeechMs
        ? this.decide("human", "short-greeting-then-pause", frame.t)
        : this.decide("machine", "long-greeting", frame.t);
    }
    // Still talking (or pausing only briefly) past the limit: a recording.
    if (heardSpeech && frame.t - (this.speechStartT as number) > this.cfg.machineSpeechMs) return this.decide("machine", "long-greeting", frame.t);
    if (!heardSpeech && frame.t >= this.cfg.silenceGiveUpMs) return this.decide("unsure", "silent-pickup", frame.t);
    if (frame.t >= this.cfg.maxAnalysisMs) return this.decide("unsure", "timeout", frame.t);
    return null;
  }

  private decide(verdict: Verdict, reason: VerdictReason, at: number): Decision {
    this.decision = { verdict, reason, at };
    return this.decision;
  }
}

/**
 * After a machine is detected: when is it safe to leave a message? Right
 * after the beep, or, on systems with no beep, once the greeting has ended
 * and the line has been quiet for a moment. Never over the greeting.
 */
export type DropMoment = "beep" | "quiet" | "timeout";

export interface DropConfig {
  /** Quiet after the greeting that means the recording is waiting for us. */
  quietMs: number;
  /** Speech we must have heard before "quiet" can count as the end of the greeting. */
  minGreetingMs: number;
  /** A beep this long, once it stops, is the cue. */
  beepMs: number;
  /** Give up waiting for a cue this long after pickup. */
  maxWaitMs: number;
}

export const DEFAULT_DROP_CONFIG: DropConfig = {
  quietMs: 2000,
  minGreetingMs: 1500,
  beepMs: 200,
  maxWaitMs: 30_000,
};

export class DropWatcher {
  private readonly cfg: DropConfig;
  private prevT: number;
  private speechMs = 0;
  private silenceMs = 0;
  private toneMs = 0;
  private sawBeep = false;
  private moment: DropMoment | null = null;

  /**
   * `startT`: when the machine was detected; `seedSpeechMs`: speech already
   * heard. `beepSeen`: the machine was recognised BY its beep, so that beep is
   * already under way and the cue is simply the moment it ends.
   */
  constructor(startT: number, seedSpeechMs: number, config: Partial<DropConfig> = {}, beepSeen = false) {
    this.cfg = { ...DEFAULT_DROP_CONFIG, ...config };
    this.prevT = startT;
    this.speechMs = seedSpeechMs;
    this.sawBeep = beepSeen;
  }

  get result(): DropMoment | null {
    return this.moment;
  }

  /** Feed frames after the machine verdict. Returns the cue the moment it comes, else null. */
  push(frame: AudioFrame): DropMoment | null {
    if (this.moment) return null;
    const dt = Math.max(0, frame.t - this.prevT);
    this.prevT = frame.t;

    if (frame.tone) {
      this.toneMs += dt;
      if (this.toneMs >= this.cfg.beepMs) this.sawBeep = true;
    } else {
      // The beep just ended: the machine is recording.
      if (this.sawBeep) return this.cue("beep");
      this.toneMs = 0;
    }
    if (frame.voiced) {
      this.speechMs += dt;
      this.silenceMs = 0;
    } else if (!frame.tone) {
      this.silenceMs += dt;
    }

    if (this.speechMs >= this.cfg.minGreetingMs && this.silenceMs >= this.cfg.quietMs) return this.cue("quiet");
    if (frame.t >= this.cfg.maxWaitMs) return this.cue("timeout");
    return null;
  }

  private cue(m: DropMoment): DropMoment {
    this.moment = m;
    return m;
  }
}
