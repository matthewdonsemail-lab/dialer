/**
 * SIP diagnostics collector: timestamped ring buffer + failure classification.
 *
 * Why this exists: a WebSocket close code 1006 carries no reason by design
 * (browsers hide it), so the "exact reasoning" has to come from *around* the
 * failure — transport transitions, SIP response codes, ICE states, and
 * pre-flight probes. Every entry is mirrored to the console with a `[sip]`
 * prefix at the matching level, so DevTools always shows the story. Call
 * `getReport()` to snapshot everything (redacted) for clipboard/paste or for
 * POSTing to /api/calls/:id as `debugLog`.
 */

export type SipEventLevel = "debug" | "info" | "warn" | "error";

export interface SipEvent {
  t: string;
  level: SipEventLevel;
  area: "transport" | "register" | "invite" | "session" | "media" | "claim" | "netcheck" | "app" | "ice" | "audio";
  message: string;
  data?: Record<string, unknown>;
}

export type SipFailureKind =
  | "NONE"
  | "SIP_NOT_CONFIGURED"
  | "TRANSPORT_UNREACHABLE"
  | "TRANSPORT_TIMEOUT"
  | "AUTH_FAILED"
  | "NO_OUTBOUND_PROFILE"
  | "MEDIA_REJECTED"
  | "ICE_FAILED"
  | "BUSY_OR_DECLINED"
  | "NOT_FOUND_OR_ROUTING"
  | "NO_ANSWER_TIMEOUT"
  | "MIC_DENIED"
  | "UNKNOWN";

export interface ClassifiedFailure {
  kind: SipFailureKind;
  title: string;
  detail: string;
  hint: string;
}

const MAX_EVENTS = 200;

const events: SipEvent[] = [];

function emit(level: SipEventLevel, area: SipEvent["area"], message: string, data?: Record<string, unknown>) {
  const entry: SipEvent = { t: new Date().toISOString(), level, area, message, data };
  events.push(entry);
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  const line = `[sip:${area}] ${message}`;
  if (level === "error") console.error(line, data ?? "");
  else if (level === "warn") console.warn(line, data ?? "");
  else if (level === "info") console.info(line, data ?? "");
  else console.debug(line, data ?? "");
}

export const sipLog = {
  debug: (area: SipEvent["area"], message: string, data?: Record<string, unknown>) => emit("debug", area, message, data),
  info: (area: SipEvent["area"], message: string, data?: Record<string, unknown>) => emit("info", area, message, data),
  warn: (area: SipEvent["area"], message: string, data?: Record<string, unknown>) => emit("warn", area, message, data),
  error: (area: SipEvent["area"], message: string, data?: Record<string, unknown>) => emit("error", area, message, data),
  clear: () => {
    events.length = 0;
  },
};

/** Classify a terminal failure from what we observed (code + context). */
export function classifyFailure(input: {
  wsCloseCode?: number | null;
  timedOut?: boolean;
  sipStatusCode?: number | null;
  micDenied?: boolean;
  notConfigured?: boolean;
  iceFailed?: boolean;
  wsUrl?: string;
}): ClassifiedFailure {
  const { wsCloseCode, timedOut, sipStatusCode, micDenied, notConfigured, iceFailed, wsUrl } = input;
  const where = wsUrl ? ` (${wsUrl})` : "";
  if (notConfigured) {
    return {
      kind: "SIP_NOT_CONFIGURED",
      title: "SIP not configured",
      detail: "No SIP credentials are baked into this build (VITE_SIP_URI/PASSWORD empty).",
      hint: "Set the VITE_SIP_* project env vars and redeploy — or run local dev with frontend/.env.local. Simulated calls are disabled; pass ?simulate=1 for UI-only testing.",
    };
  }
  if (micDenied) {
    return {
      kind: "MIC_DENIED",
      title: "Microphone blocked",
      detail: "The browser refused microphone access, so no audio could be captured.",
      hint: "Allow the microphone in the browser site settings and redial.",
    };
  }
  if (sipStatusCode !== null && sipStatusCode !== undefined) {
    if (sipStatusCode === 403) {
      return {
        kind: "NO_OUTBOUND_PROFILE",
        title: "Telnyx rejected the call (403)",
        detail: `The SIP connection has no Outbound Voice Profile assigned${where}. Signaling worked — routing did not.`,
        hint: "Attach an Outbound Voice Profile (US/CA Default) to the credential connection in Telnyx.",
      };
    }
    if (sipStatusCode === 407) {
      return {
        kind: "AUTH_FAILED",
        title: "SIP proxy authentication failed (407 loop)",
        detail: "Telnyx kept challenging proxy auth; the digest credentials were rejected.",
        hint: "Check the SIP username/password baked into the build (VITE_SIP_*) match the Telnyx credential.",
      };
    }
    if (sipStatusCode === 488) {
      return {
        kind: "MEDIA_REJECTED",
        title: "Media rejected (488)",
        detail: "Telnyx answered but our SDP answer could not be applied (historically: missing RTCP-MUX).",
        hint: "rtcpMuxPolicy=negotiate should tolerate this — if it persists, capture the SDP answer from the log.",
      };
    }
    if (iceFailed) {
      return {
        kind: "ICE_FAILED",
        title: "Media path failed (ICE)",
        detail: "Signaling completed but no audio path could be established (ICE failed/disconnected, likely UDP blocked or symmetric NAT with no TURN relay).",
        hint: "Check the ice/audio trail in diagnostics. If host+srflx candidates never pair, the network needs TURN (Telnyx TURN credentials) or UDP egress opened.",
      };
    }
    if (sipStatusCode === 486 || sipStatusCode === 603) {
      return {
        kind: "BUSY_OR_DECLINED",
        title: sipStatusCode === 486 ? "Busy (486)" : "Declined (603)",
        detail: "The far end is busy or declined the call. Nothing wrong on our side.",
        hint: "Try again later or leave a message.",
      };
    }
    if (sipStatusCode === 404 || sipStatusCode === 480 || sipStatusCode === 484) {
      return {
        kind: "NOT_FOUND_OR_ROUTING",
        title: `Routing failure (${sipStatusCode})`,
        detail: "Telnyx could not route to the dialed number.",
        hint: "Verify the number is E.164 and the outbound profile allows the destination.",
      };
    }
    return {
      kind: "UNKNOWN",
      title: `SIP failure (${sipStatusCode})`,
      detail: `Telnyx answered with an unexpected failure code${where}.`,
      hint: "Copy diagnostics and check the Telnyx-side call report.",
    };
  }
  if (timedOut || wsCloseCode === 1006) {
    return {
      kind: timedOut ? "TRANSPORT_TIMEOUT" : "TRANSPORT_UNREACHABLE",
      title: timedOut ? "Signaling timed out" : "Signaling unreachable (1006)",
      detail: `The WebSocket to${where} never opened (close 1006 = abnormal close, no reason by design). ` +
        "This is a network/egress problem between this browser and Telnyx — not credentials.",
      hint: "Confirm wss://sip.telnyx.com:7443 is reachable (port 7443 outbound). Corporate/VPN egress often blocks it; 443+5061 working while 7443 times out points at the firewall.",
    };
  }
  return {
    kind: "UNKNOWN",
    title: "Call failed",
    detail: "The call ended without a classified reason — see the event trail.",
    hint: "Copy diagnostics for analysis.",
  };
}

export interface SipReport {
  generatedAt: string;
  sipConfig: { uri: string; wsUrl: string; callerId: string; provider: string };
  failure: ClassifiedFailure;
  telnyxCallControlId: string | null;
  events: SipEvent[];
}

/** Snapshot everything (config redacted — no password) for clipboard or server log. */
export function getReport(
  sipConfig: { uri: string; wsUrl: string; callerId: string; provider: string },
  failure: ClassifiedFailure,
  telnyxCallControlId: string | null,
): SipReport {
  return {
    generatedAt: new Date().toISOString(),
    sipConfig: { ...sipConfig },
    failure,
    telnyxCallControlId,
    events: [...events],
  };
}
