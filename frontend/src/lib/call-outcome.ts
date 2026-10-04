/**
 * Single source of truth for the call-disposition vocabulary.
 *
 * Two vocabularies exist and used to drift apart:
 *   - CallOutcome: what the softphone shows/holds while a call is up
 *   - CallStatus:  what is persisted on agencyCalls.status (a free-text field)
 *
 * Every outcome the operator can pick must have an explicit status. The old
 * mapper handled 4 of 7 outcomes and let `voicemail`, `dnc`, `wrong_number`
 * and `disconnected` fall through a `return "COMPLETED"` default, so those
 * selections were silently persisted as a successful connect - which is what
 * made the disposition dropdown look like it was not saving.
 */

/** Operator-visible dispositions. Mirrors OUTCOME_CONFIG keys in OutcomeSelect. */
export type CallOutcome =
  | "connected"
  | "answered"
  | "no_answer"
  | "busy"
  | "voicemail"
  | "failed"
  | "disconnected"
  | "wrong_number"
  | "dnc";

/**
 * Values written to agencyCalls.status. The field is TEXT, so new values need
 * no Twenty schema change - only a StatusBadge colour to render properly.
 */
export type CallStatus =
  | "IN_PROGRESS"
  | "COMPLETED"
  | "NO_ANSWER"
  | "BUSY"
  | "VOICEMAIL"
  | "FAILED"
  | "WRONG_NUMBER"
  | "DNC";

const OUTCOME_TO_STATUS: Record<CallOutcome, CallStatus> = {
  // Media path opened. Deliberately NOT a connect: an IVR menu or a voicemail
  // greeting opens the same media path a human does, so this only records that
  // something answered the phone. See `connected` in OUTCOME_CONFIG.
  connected: "COMPLETED",
  // Operator-confirmed a human spoke.
  answered: "COMPLETED",
  no_answer: "NO_ANSWER",
  busy: "BUSY",
  voicemail: "VOICEMAIL",
  failed: "FAILED",
  disconnected: "NO_ANSWER",
  wrong_number: "WRONG_NUMBER",
  dnc: "DNC",
};

/**
 * Outcome -> persisted status. Total by construction: an unknown outcome maps
 * to FAILED, never to a success value. A disposition we cannot represent must
 * be loud, not optimistic.
 */
export function mapOutcomeToCallStatus(outcome: string): CallStatus {
  const key = String(outcome ?? "").trim().toLowerCase() as CallOutcome;
  return OUTCOME_TO_STATUS[key] ?? "FAILED";
}


/** Default per-prospect dial cooldown, in hours. */
export const DIAL_COOLDOWN_HOURS = 24;

export interface CooldownCandidate {
  toNumber?: string | null;
  startedAt?: string | null;
  created_at?: string | null;
}

export function normalizePhone(n?: string | null): string {
  return String(n ?? "").replace(/[^\d+]/g, "");
}

/**
 * Last outbound attempt to `phoneNumber`, or null if never dialled / the
 * timestamp is unusable.
 */
export function lastDialTo(
  calls: CooldownCandidate[],
  phoneNumber: string,
): Date | null {
  const target = normalizePhone(phoneNumber);
  if (!target) return null;
  let latest: number | null = null;
  for (const call of calls) {
    if (normalizePhone(call.toNumber) !== target) continue;
    const raw = call.startedAt || call.created_at;
    if (!raw) continue;
    const t = new Date(raw).getTime();
    if (!Number.isFinite(t)) continue;
    if (latest === null || t > latest) latest = t;
  }
  return latest === null ? null : new Date(latest);
}

/**
 * True when `phoneNumber` was already dialled inside the cooldown window.
 * Same-day repeat dials burned real money in the 2026-10-02 batch (one number
 * three times inside 12s), so the guard lives in the dial path, not in a
 * per-browser setting.
 */
export function isWithinCooldown(
  calls: CooldownCandidate[],
  phoneNumber: string,
  cooldownHours = DIAL_COOLDOWN_HOURS,
  now: Date = new Date(),
): boolean {
  const last = lastDialTo(calls, phoneNumber);
  if (!last) return false;
  const elapsedMs = now.getTime() - last.getTime();
  if (elapsedMs < 0) return true; // clock skew / future-dated row: do not redial
  return elapsedMs < cooldownHours * 60 * 60 * 1000;
}
