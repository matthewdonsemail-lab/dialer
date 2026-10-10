/**
 * Single source of truth for the call-disposition vocabulary (WAVV's list).
 *
 * Three vocabularies meet here and used to drift apart:
 *   - CallOutcome: what the operator picks in the softphone
 *   - CallStatus:  what is persisted on agencyCalls.status (a free-text field)
 *   - record status: what the lead/prospect becomes after the call
 *
 * Every disposition the operator can pick declares all three explicitly. An
 * old mapper let unknown outcomes fall through to "COMPLETED", which silently
 * recorded voicemails and DNCs as successful connects.
 */

export type DispositionType = "positive" | "negative";

/** Operator-selectable dispositions, in WAVV's order. */
export type Disposition =
  | "interested"
  | "appointment_set"
  | "callback"
  | "good_number"
  | "left_callback"
  | "left_voicemail"
  | "not_interested"
  | "bad_number"
  | "no_answer"
  | "wrong_number"
  | "do_not_contact";

/**
 * Outcomes the softphone sets on its own: `connected` when the media path
 * opens (an IVR or voicemail greeting opens it too, so it is not a human
 * answer) and `failed` when the call could not be placed. Never offered as
 * choices; the operator replaces `connected` with a real disposition.
 */
export type SystemOutcome = "connected" | "failed";

export type CallOutcome = Disposition | SystemOutcome;

/**
 * Values written to agencyCalls.status. The field is TEXT, so new values need
 * no Twenty schema change. VOICEMAIL and DNC keep their earlier spelling so
 * existing call history stays grouped with new calls.
 */
export type CallStatus =
  | "IN_PROGRESS"
  | "COMPLETED"
  | "FAILED"
  | "INTERESTED"
  | "APPOINTMENT_SET"
  | "CALLBACK"
  | "GOOD_NUMBER"
  | "LEFT_CALLBACK"
  | "VOICEMAIL"
  | "NOT_INTERESTED"
  | "BAD_NUMBER"
  | "NO_ANSWER"
  | "WRONG_NUMBER"
  | "DNC";

export interface DispositionDef {
  value: Disposition;
  label: string;
  type: DispositionType;
  /** Persisted on the call. */
  status: CallStatus;
  /** The lead/prospect status after this call (frontend status vocabulary). */
  recordStatus: string;
}

export const DISPOSITIONS: DispositionDef[] = [
  { value: "interested", label: "Interested", type: "positive", status: "INTERESTED", recordStatus: "interested" },
  { value: "appointment_set", label: "Appointment Set", type: "positive", status: "APPOINTMENT_SET", recordStatus: "callback" },
  { value: "callback", label: "Callback", type: "positive", status: "CALLBACK", recordStatus: "callback" },
  { value: "good_number", label: "Good Number", type: "positive", status: "GOOD_NUMBER", recordStatus: "contacted" },
  { value: "left_callback", label: "Left Callback", type: "positive", status: "LEFT_CALLBACK", recordStatus: "callback" },
  { value: "left_voicemail", label: "Left Voicemail", type: "positive", status: "VOICEMAIL", recordStatus: "callback" },
  { value: "not_interested", label: "Not Interested", type: "negative", status: "NOT_INTERESTED", recordStatus: "not_interested" },
  { value: "bad_number", label: "Bad Number", type: "negative", status: "BAD_NUMBER", recordStatus: "not_interested" },
  { value: "no_answer", label: "No Answer", type: "negative", status: "NO_ANSWER", recordStatus: "callback" },
  { value: "wrong_number", label: "Wrong Number", type: "negative", status: "WRONG_NUMBER", recordStatus: "not_interested" },
  { value: "do_not_contact", label: "Do Not Contact", type: "negative", status: "DNC", recordStatus: "do_not_contact" },
];

const BY_VALUE = new Map<string, DispositionDef>(DISPOSITIONS.map((d) => [d.value, d]));

const SYSTEM_STATUS: Record<SystemOutcome, CallStatus> = {
  connected: "COMPLETED",
  failed: "FAILED",
};

/** Label for any outcome, including the system ones. */
export function outcomeLabel(outcome: string): string {
  if (outcome === "connected") return "Connected: pick a disposition";
  if (outcome === "failed") return "Call failed";
  return BY_VALUE.get(outcome)?.label ?? outcome;
}

export function dispositionFor(outcome: string): DispositionDef | undefined {
  return BY_VALUE.get(String(outcome ?? "").trim().toLowerCase());
}

/**
 * Outcome -> persisted status. Total by construction: an unknown outcome maps
 * to FAILED, never to a success value. A disposition we cannot represent must
 * be loud, not optimistic.
 */
export function mapOutcomeToCallStatus(outcome: string): CallStatus {
  const key = String(outcome ?? "").trim().toLowerCase();
  return BY_VALUE.get(key)?.status ?? SYSTEM_STATUS[key as SystemOutcome] ?? "FAILED";
}

/** The lead/prospect status a call outcome implies, or null to leave it unchanged. */
export function recordStatusForOutcome(outcome: string): string | null {
  if (outcome === "connected") return "callback"; // media opened, no human confirmed yet
  return dispositionFor(outcome)?.recordStatus ?? null;
}

/**
 * Positive / negative for a persisted call status, including statuses written
 * before the WAVV list (COMPLETED, BUSY). In-progress calls are neither.
 */
const STATUS_TYPE: Record<string, DispositionType> = {
  ...Object.fromEntries(DISPOSITIONS.map((d) => [d.status, d.type])),
  COMPLETED: "positive",
  BUSY: "negative",
  FAILED: "negative",
};

export function dispositionTypeOfStatus(status: string | null | undefined): DispositionType | null {
  return STATUS_TYPE[String(status ?? "").toUpperCase()] ?? null;
}

/** Display label for a persisted call status ("APPOINTMENT_SET" -> "Appointment Set"). */
export function callStatusLabel(status: string | null | undefined): string {
  const upper = String(status ?? "").toUpperCase();
  const def = DISPOSITIONS.find((d) => d.status === upper);
  if (def) return def.label;
  return upper
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
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
