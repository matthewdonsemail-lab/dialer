/**
 * The three dialing modes, as rules the power dialer follows.
 *
 *   Standard      Slow and steady. Every call, answered or not, ends with the
 *                 call summary, and "Save & next" starts the next call.
 *   Advanced      Calls that nobody answers are logged and skipped with no
 *                 clicks. The moment someone answers, or a voicemail picks
 *                 up, it stops for you.
 *   Answer Boost  Listens to who answers. Machines are hung up on (or get your
 *                 recorded voicemail) and the next contact is dialed at once;
 *                 you are only connected to a person.
 *
 * Pure, so the rules are unit tested apart from the audio and the SIP layer.
 */

export const DIALING_MODES = ["standard", "advanced", "boost"] as const;
export type DialingMode = (typeof DIALING_MODES)[number];

export const DEFAULT_DIALING_MODE: DialingMode = "standard";

export interface ModeInfo {
  value: DialingMode;
  label: string;
  /** A few words on what it does, for chips and the queue. */
  short: string;
  /** One sentence on what it does. */
  description: string;
  /** Who it suits. */
  suits: string;
}

export const MODE_INFO: Record<DialingMode, ModeInfo> = {
  standard: {
    value: "standard",
    label: "Standard",
    short: "Stops after every call",
    description: "One call at a time. After every call, answered or not, you see the summary and press Save & next to call the next person.",
    suits: "Getting used to the dialer, or working a small list carefully.",
  },
  advanced: {
    value: "advanced",
    label: "Advanced",
    short: "Skips unanswered calls",
    description: "Dials through your list on its own. Unanswered calls are logged and skipped with no clicks, and it stops when someone answers or a voicemail picks up.",
    suits: "Working a long list where most calls ring out.",
  },
  boost: {
    value: "boost",
    label: "Answer Boost",
    short: "Skips machines too",
    description: "Listens to who answers. Answering machines are skipped automatically, or get your recorded voicemail, and you are only connected to a live person.",
    suits: "Reaching more people in less time.",
  },
};

export function parseDialingMode(value: unknown): DialingMode {
  return DIALING_MODES.find((m) => m === value) ?? DEFAULT_DIALING_MODE;
}

/** Answer Boost must ring long enough to reach a machine's greeting and beep. */
export const BOOST_MIN_RING_SECONDS = 35;
/** The ring time actually used: Answer Boost never rings for less than 35 seconds. */
export function effectiveRingSeconds(mode: DialingMode, savedSeconds: number): number {
  return mode === "boost" ? Math.max(savedSeconds, BOOST_MIN_RING_SECONDS) : savedSeconds;
}

/** What the power dialer does around each contact in a mode. */
export interface CallPlan {
  /** Listen to who answers and hang up on machines. */
  screenAnswers: boolean;
  /** A call nobody answered is logged as No answer and the next contact is dialed, no clicks. */
  autoWrapUnanswered: boolean;
  /** A detected machine is skipped (or gets the voicemail) and the next contact is dialed, no clicks. */
  autoWrapMachines: boolean;
}

export function planFor(mode: DialingMode): CallPlan {
  switch (mode) {
    case "standard":
      return { screenAnswers: false, autoWrapUnanswered: false, autoWrapMachines: false };
    case "advanced":
      return { screenAnswers: false, autoWrapUnanswered: true, autoWrapMachines: false };
    case "boost":
      return { screenAnswers: true, autoWrapUnanswered: true, autoWrapMachines: true };
  }
}

/**
 * Does a call that just ended get logged and skipped with no clicks? Only when
 * nobody was on the line (it rang out, was declined, or hung up before a person
 * was connected) and the mode skips unanswered calls.
 */
export function shouldAutoWrapEnd(plan: Pick<CallPlan, "autoWrapUnanswered"> | undefined, end: { unattended: boolean; humanConnected: boolean }): boolean {
  return !!plan?.autoWrapUnanswered && end.unattended && !end.humanConnected;
}

/** What to record when a machine was detected, and whether the call counts as a voicemail left. */
export interface MachineResult {
  /** The call outcome (a disposition value). */
  outcome: "left_voicemail" | "no_answer";
  /** The automatic note on the call, so Call History says what happened. */
  note: string;
}

export function machineResult(args: { left: boolean; seconds?: number; failed?: boolean }): MachineResult {
  if (args.left) {
    const length = args.seconds ? ` (${Math.round(args.seconds)}s)` : "";
    return { outcome: "left_voicemail", note: `Answering machine detected: left your recorded voicemail${length}.` };
  }
  return {
    outcome: "no_answer",
    note: args.failed
      ? "Answering machine detected: your voicemail could not be left, so the call was skipped."
      : "Answering machine detected: skipped automatically.",
  };
}
