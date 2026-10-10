/**
 * A pipeline is a set of named states and the moves allowed between them.
 * Every record field that represents progress (contact status, outreach,
 * video, call result) is declared as one, so the backend and the SPA agree
 * on what a value means, how it is shown, and which change is legal.
 */

/** How a state reads at a glance. The UI maps a tone to one colour, everywhere. */
export type Tone = "neutral" | "info" | "progress" | "positive" | "negative" | "warning";

export interface StateDef<S extends string> {
  /** Shown to people: "Do not contact", never "DO_NOT_CONTACT". */
  label: string;
  /** One plain sentence: what being in this state means. */
  description: string;
  tone: Tone;
  /** States reachable from here by an ordinary change. */
  next: readonly S[];
  /** Terminal states can only be left through an explicit override. */
  terminal?: boolean;
}

export interface MachineSpec<S extends string> {
  /** The Twenty field this machine guards, e.g. "coldCallStatus". */
  field: string;
  /** Used for a missing or blank value. */
  initial: S;
  states: Record<S, StateDef<S>>;
  /** Moves allowed only with `override` (e.g. reopening "Do not contact"). */
  overrides?: ReadonlyArray<readonly [from: S, to: S]>;
}

export type TransitionResult<S extends string> =
  | { ok: true; from: S; to: S; changed: boolean }
  | { ok: false; from: S; to: S | null; reason: string };

export interface Machine<S extends string> {
  readonly field: string;
  readonly initial: S;
  /** States in declaration order (also the order menus show them in). */
  readonly states: readonly S[];
  isState(value: unknown): value is S;
  /** The state for a stored value; blank becomes the initial state, unknown becomes null. */
  parse(value: unknown): S | null;
  def(state: S): StateDef<S>;
  label(state: S | null | undefined): string;
  /** States a change from `from` may go to (ordinary moves only). */
  nextStates(from: S | null | undefined): S[];
  can(from: S | null | undefined, to: S, options?: { override?: boolean }): boolean;
  /** Validates a change and explains a refusal in words a person can act on. */
  transition(from: unknown, to: unknown, options?: { override?: boolean }): TransitionResult<S>;
}
