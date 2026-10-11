import { AnswerAnalyzer, DropWatcher, type AudioFrame, type DropMoment } from "@/domains/dialer/answerDetection";
import type { RemoteProbe } from "@/domains/dialer/answerProbe";

/**
 * Screens one answered call: who picked up, and what to do about it.
 *
 *   listening       deciding person or machine; the operator hears nothing
 *   person / unsure -> onHuman: connect the operator (and keep an ear out for a
 *                   late beep, in case a voicemail started with a short pause)
 *   machine         -> with a recording: wait for the beep, play it, then
 *                   onMachine({left: true}); without one, onMachine({left: false})
 *
 * Exactly one of onHuman or onMachine fires, once. The audio probe and the
 * message playback are injected so the whole flow is unit tested.
 */

export type ScreenPhase = "listening" | "waiting-beep" | "leaving";

export interface MachineResult {
  /** The recorded voicemail was played into the call. */
  left: boolean;
  /** Length of the voicemail left. */
  seconds?: number;
  /** A voicemail was wanted but could not be left. */
  failed?: boolean;
}

export interface ScreenHandlers {
  onPhase: (phase: ScreenPhase | null) => void;
  onHuman: (reason: string) => void;
  onMachine: (result: MachineResult) => void;
  /** After a person was assumed: a beep suggests it was a voicemail after all. */
  onLateBeep: () => void;
  /** The operator's recording, or null when there is none (machines are then skipped). */
  loadRecording: () => Promise<Blob | null>;
}

export interface ScreenDeps {
  startProbe: (session: any, onFrame: (f: AudioFrame) => void) => RemoteProbe | null;
  playVoicemail: (session: any, blob: Blob) => Promise<{ durationMs: number }>;
}

/** How long after assuming a person we keep listening for a late beep. */
export const LATE_BEEP_WINDOW_MS = 12_000;
const LATE_BEEP_MS = 300;

export class AnswerScreen {
  private readonly analyzer = new AnswerAnalyzer();
  private drop: DropWatcher | null = null;
  private recording: Blob | null = null;
  private probe: RemoteProbe | null = null;
  private lastT = 0;
  private humanAt: number | null = null;
  private lateToneMs = 0;
  private lateReported = false;
  private machine: "none" | "loading" | "waiting" | "leaving" = "none";
  /** Told to stop (call ended, or the listening window closed): nothing more is processed or reported. */
  private stopped = false;
  /** onHuman or onMachine has fired: the one outcome is out. */
  private reported = false;

  constructor(
    private readonly session: any,
    private readonly handlers: ScreenHandlers,
    private readonly deps: ScreenDeps,
  ) {}

  start() {
    this.probe = this.deps.startProbe(this.session, (f) => this.onFrame(f));
    if (!this.probe) {
      // Nothing to listen with: connect, rather than guess.
      this.connectHuman("no-probe");
      return;
    }
    this.handlers.onPhase("listening");
  }

  /** Stop listening (call ended, or the operator took over). Reports nothing further. */
  stop() {
    this.stopped = true;
    this.probe?.stop();
    this.probe = null;
  }

  private connectHuman(reason: string) {
    if (this.reported || this.machine !== "none") return;
    this.reported = true;
    this.humanAt = this.lastT;
    this.handlers.onPhase(null);
    this.handlers.onHuman(reason);
    // With no probe there is nothing left to watch for a late beep.
    if (!this.probe) this.stopped = true;
  }

  private onFrame(f: AudioFrame) {
    if (this.stopped) return;
    const dt = Math.max(0, f.t - this.lastT);
    this.lastT = f.t;

    if (this.humanAt !== null) return this.watchForLateBeep(f, dt);
    if (this.machine === "waiting") return this.watchForDropCue(f);
    if (this.machine !== "none") return;

    const decision = this.analyzer.push(f);
    if (!decision) return;
    if (decision.verdict === "machine") void this.beginMachine(decision.reason === "beep");
    else this.connectHuman(decision.reason);
  }

  private watchForLateBeep(f: AudioFrame, dt: number) {
    if (this.humanAt === null || this.lateReported) return;
    if (f.t - this.humanAt > LATE_BEEP_WINDOW_MS) {
      // Window over: stop listening.
      this.stop();
      return;
    }
    this.lateToneMs = f.tone ? this.lateToneMs + dt : 0;
    if (this.lateToneMs >= LATE_BEEP_MS) {
      this.lateReported = true;
      this.handlers.onLateBeep();
    }
  }

  private async beginMachine(byBeep: boolean) {
    this.machine = "loading";
    let blob: Blob | null = null;
    try {
      blob = await this.handlers.loadRecording();
    } catch {
      blob = null;
    }
    if (this.stopped) return;
    if (!blob) return this.finishMachine({ left: false });
    this.recording = blob;
    this.drop = new DropWatcher(this.lastT, this.analyzer.speechSpanMs, {}, byBeep);
    this.machine = "waiting";
    this.handlers.onPhase("waiting-beep");
  }

  private watchForDropCue(f: AudioFrame) {
    const cue: DropMoment | null = this.drop?.push(f) ?? null;
    if (!cue) return;
    // No beep and no quiet ever came: never talk over a greeting.
    if (cue === "timeout") return this.finishMachine({ left: false, failed: true });
    void this.leaveMessage();
  }

  private async leaveMessage() {
    if (!this.recording || this.machine !== "waiting") return;
    this.machine = "leaving";
    this.handlers.onPhase("leaving");
    // The greeting is over; stop listening so the message is the only audio path in use.
    this.probe?.stop();
    this.probe = null;
    let result: MachineResult;
    try {
      const { durationMs } = await this.deps.playVoicemail(this.session, this.recording);
      result = { left: true, seconds: durationMs / 1000 };
    } catch {
      result = { left: false, failed: true };
    }
    if (this.stopped) return; // the call ended mid-message; the provider is already wrapping it up
    this.finishMachine(result);
  }

  private finishMachine(result: MachineResult) {
    if (this.reported || this.stopped) return;
    this.reported = true;
    this.stopped = true;
    this.probe?.stop();
    this.probe = null;
    this.handlers.onPhase(null);
    this.handlers.onMachine(result);
  }
}
