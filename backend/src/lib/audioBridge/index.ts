/**
 * Phone audio for the dialer (WAVV "Call me" / "Dial in").
 *
 * Instead of browser audio, the operator's phone is one call leg (the agent
 * leg) and each contact is dialled as a second leg linked to it; Telnyx
 * bridges them when the contact answers (dial `link_to` + `bridge_on_answer`)
 * and parks the agent leg again when the contact hangs up, so one phone call
 * carries a whole power-dialing session.
 *
 *   Call me : the backend rings the operator's phone; answering makes it ready.
 *   Dial in : the operator calls the dial-in number and enters a 4-digit PIN.
 *
 * State lives in a Twenty record (dialerAudioSessions) because webhooks and
 * the browser's status polls run in different serverless invocations. This
 * module is pure logic: Telnyx actions and the store are injected, so the
 * event flow is unit-tested without real calls.
 */

export type AudioMode = "call_me" | "dial_in";
export type SessionStatus = "calling_agent" | "waiting_dial_in" | "ready" | "ended" | "failed";
export type ContactState = "idle" | "dialing" | "ringing" | "answered" | "ended";

export interface AudioSession {
  id: string;
  mode: AudioMode;
  status: SessionStatus;
  memberId: string;
  agentPhone: string | null;
  agentLegId: string | null;
  pin: string | null;
  contactLegId: string | null;
  contactState: ContactState;
  contactAnsweredAt: string | null;
  contactEndedAt: string | null;
  hangupCause: string | null;
  error: string | null;
  expiresAt: string;
}

/** Carried through Telnyx as base64 client_state and echoed on webhooks. */
export interface BridgeState {
  kind: "agent" | "contact" | "dialin";
  sessionId?: string;
  tries?: number;
}

export const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
export const MAX_PIN_TRIES = 3;

export function encodeState(state: BridgeState): string {
  return Buffer.from(JSON.stringify(state), "utf8").toString("base64");
}

export function decodeState(raw: unknown): BridgeState | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
    return parsed && typeof parsed.kind === "string" ? (parsed as BridgeState) : null;
  } catch {
    return null;
  }
}

export function digitsOnly(n: unknown): string {
  return String(n ?? "").replace(/\D/g, "");
}

export function isExpired(session: Pick<AudioSession, "expiresAt">, now: Date): boolean {
  const t = new Date(session.expiresAt).getTime();
  return !Number.isFinite(t) || t <= now.getTime();
}

export function isLive(session: AudioSession, now: Date): boolean {
  return (session.status === "calling_agent" || session.status === "waiting_dial_in" || session.status === "ready") && !isExpired(session, now);
}

/** A 4-digit PIN no other live dial-in session is using. */
export function generatePin(taken: Set<string>, rand: () => number = Math.random): string {
  for (let i = 0; i < 50; i++) {
    const pin = String(Math.floor(rand() * 9000) + 1000);
    if (!taken.has(pin)) return pin;
  }
  throw new Error("No free dial-in PIN; try again in a moment.");
}

export interface BridgeDeps {
  store: {
    list(): Promise<AudioSession[]>;
    update(id: string, patch: Partial<AudioSession>): Promise<void>;
  };
  calls: {
    answer(callControlId: string, state: BridgeState): Promise<void>;
    gather(callControlId: string, prompt: string, state: BridgeState): Promise<void>;
    speak(callControlId: string, text: string, state: BridgeState): Promise<void>;
    hangup(callControlId: string): Promise<void>;
  };
  dialInNumber?: string | null;
  now(): Date;
}

const PIN_PROMPT = "Welcome to the Cold Dialer. Please enter your four digit PIN.";
const PIN_RETRY = "That PIN was not recognised. Please enter the PIN shown on your screen.";
const CONNECTED = "You are connected. Dialing will start from your screen.";

/**
 * Handle one Telnyx Call Control webhook. Returns a short description when
 * the event belonged to phone audio, or null to let other handlers run.
 */
export async function handleBridgeEvent(eventType: string, payload: any, deps: BridgeDeps): Promise<string | null> {
  const ccid: string | undefined = payload?.call_control_id;
  if (!ccid) return null;
  const state = decodeState(payload?.client_state);
  const now = deps.now();

  // A fresh inbound call to the dial-in number: answer, then ask for the PIN.
  const isDialIn =
    eventType === "call.initiated" &&
    !state &&
    payload?.direction === "incoming" &&
    !!deps.dialInNumber &&
    digitsOnly(payload?.to) === digitsOnly(deps.dialInNumber);
  if (isDialIn) {
    await deps.calls.answer(ccid, { kind: "dialin", tries: 0 });
    return "dial-in answered";
  }

  if (eventType === "call.answered" && state?.kind === "dialin") {
    await deps.calls.gather(ccid, PIN_PROMPT, { kind: "dialin", tries: 0 });
    return "asked for PIN";
  }

  if (eventType === "call.gather.ended" && state?.kind === "dialin") {
    const digits = digitsOnly(payload?.digits);
    const sessions = await deps.store.list();
    const match = sessions.find((s) => s.mode === "dial_in" && s.status === "waiting_dial_in" && s.pin === digits && !isExpired(s, now));
    if (match) {
      await deps.store.update(match.id, { status: "ready", agentLegId: ccid, error: null });
      await deps.calls.speak(ccid, CONNECTED, { kind: "agent", sessionId: match.id });
      return `dial-in PIN matched session ${match.id}`;
    }
    const tries = (state.tries ?? 0) + 1;
    if (tries < MAX_PIN_TRIES) {
      await deps.calls.gather(ccid, PIN_RETRY, { kind: "dialin", tries });
      return `PIN rejected (try ${tries})`;
    }
    await deps.calls.hangup(ccid);
    return "PIN rejected; hung up";
  }

  const sessions = await deps.store.list();
  const byAgent = sessions.find((s) => s.agentLegId === ccid);
  const byContact = sessions.find((s) => s.contactLegId === ccid);

  if (eventType === "call.answered") {
    if (byAgent && byAgent.status === "calling_agent") {
      await deps.store.update(byAgent.id, { status: "ready", error: null });
      await deps.calls.speak(ccid, CONNECTED, { kind: "agent", sessionId: byAgent.id });
      return `agent answered session ${byAgent.id}`;
    }
    if (byContact) {
      await deps.store.update(byContact.id, { contactState: "answered", contactAnsweredAt: now.toISOString() });
      return `contact answered session ${byContact.id}`;
    }
    return null;
  }

  if (eventType === "call.initiated" && byContact && byContact.contactState === "dialing") {
    await deps.store.update(byContact.id, { contactState: "ringing" });
    return `contact ringing session ${byContact.id}`;
  }

  if (eventType === "call.hangup") {
    if (byAgent) {
      // The operator hung up their phone: the session is over, and a contact
      // still on the line is dropped rather than left talking to no one.
      if (byAgent.contactLegId && byAgent.contactState !== "ended" && byAgent.contactState !== "idle") {
        await deps.calls.hangup(byAgent.contactLegId).catch(() => {});
      }
      const unanswered = byAgent.status === "calling_agent";
      await deps.store.update(byAgent.id, {
        status: unanswered ? "failed" : "ended",
        error: unanswered ? `Your phone did not answer (${payload?.hangup_cause ?? "no answer"}).` : null,
        contactState: byAgent.contactState === "idle" ? "idle" : "ended",
      });
      return `agent leg ended session ${byAgent.id}`;
    }
    if (byContact) {
      await deps.store.update(byContact.id, {
        contactState: "ended",
        contactEndedAt: now.toISOString(),
        hangupCause: payload?.hangup_cause ?? null,
      });
      return `contact leg ended session ${byContact.id}`;
    }
  }

  return null;
}
