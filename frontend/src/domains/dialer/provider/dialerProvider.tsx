import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { describeError } from "@/domains/feedback/describeError";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/domains/auth/provider";
import { useToast } from "@/domains/ui/toast";
import { useAudioBridge } from "@/domains/dialer/audio";
import { useAudioSettings } from "@/domains/dialer/audio";
import { usePersistedState } from "@/domains/app/persistedState";
import { useCalls } from "@/domains/calls/data";
import { api } from "@/domains/api/client";
import { DIAL_COOLDOWN_HOURS, isWithinCooldown, lastDialTo, recordStatusForOutcome } from "@/domains/calls/disposition";
import { getUnansweredTimeoutSeconds, HEARTBEAT_INTERVAL_MS } from "@/domains/app/config";
import { classifyFailure, getSipConfig, isSipConfigured, sipLog, type ClassifiedFailure } from "@/domains/dialer/sip";
import { CallLifecycle } from "@/domains/dialer/lifecycle";
import { attachRemoteMedia, getMicStream, loadSip, sendSessionDtmf, startAgent, type SipAgent } from "@/domains/dialer/sip";
import { pickCallLine } from "@/domains/dialer/route";

/** Explicit opt-in only (?simulate=1): simulated calls never happen silently. */
export const SIMULATE_CALLS =
  typeof window !== "undefined" && new URLSearchParams(window.location.search).get("simulate") === "1";

export type CallState = "idle" | "connecting" | "ringing" | "active" | "on_hold" | "ended";

export interface DialTarget {
  contactType: "prospect" | "lead" | null;
  contactId: string | null;
  phone: string;
  name: string;
  /** Campaign whose script the Script button opens. */
  campaignId?: string | null;
  /** The contact's country (any spelling), so the call goes out from a number in it. */
  country?: string | null;
}

export interface DialOptions {
  /** Summary button label, e.g. "Save & next" in a power-dialer session. */
  saveLabel?: string;
  /** Runs after the summary is saved (the power dialer advances here). */
  onSaved?: (outcome: string) => void;
}

export interface DialerLine {
  id: string;
  phoneNumber: string;
  countryCode: string | null;
  callState: string;
  claimedByMemberId: string | null;
}

interface IncomingCall {
  session: any;
  number: string;
  name: string;
}

interface DialerValue {
  // dock
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  pinned: boolean;
  setPinned: (pinned: boolean) => void;
  // line and registration
  lines: DialerLine[];
  line: DialerLine | null;
  setLine: (id: string) => void;
  registered: boolean;
  phoneAudio: boolean;
  // the call
  state: CallState;
  target: DialTarget | null;
  direction: "outbound" | "inbound";
  duration: number;
  muted: boolean;
  held: boolean;
  outcome: string;
  setOutcome: (outcome: string) => void;
  notes: string;
  setNotes: (notes: string) => void;
  notesSaved: boolean;
  notesError: string | null;
  /** Saves the current notes again after a failure. */
  retryNotes: () => void;
  failure: ClassifiedFailure | null;
  cooldownNotice: string | null;
  recWarning: string | null;
  incoming: { number: string; name: string } | null;
  saveLabel: string;
  saving: boolean;
  /** The live sip.js session, if any. */
  session: any;
  // actions
  dial: (target: DialTarget, options?: DialOptions) => Promise<void>;
  dialAnyway: () => void;
  hangup: () => void;
  mute: () => void;
  hold: () => void;
  sendDtmf: (tone: string) => void;
  accept: () => Promise<void>;
  decline: () => void;
  saveSummary: () => Promise<void>;
  discardSummary: () => void;
}

const DialerContext = createContext<DialerValue | null>(null);

export function useDialer(): DialerValue {
  const ctx = useContext(DialerContext);
  if (!ctx) throw new Error("useDialer must be used inside DialerProvider");
  return ctx;
}

const LIVE: CallState[] = ["connecting", "ringing", "active", "on_hold"];
export const isLive = (s: CallState) => LIVE.includes(s);

/**
 * The one dialer for the whole app. Owns a single registered sip.js agent
 * (inbound calls ring while idle), the live call, the caller-ID line and the
 * dock's open/pinned state, so a call keeps going while the operator moves
 * between pages. Pages and the power dialer start calls with `dial()`.
 */
export function DialerProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { error: toastError, warning: toastWarning, info: toastInfo } = useToast();
  const { source: audioSource, microphoneId, speakerId } = useAudioSettings();
  const audioBridge = useAudioBridge();
  const phoneAudio = audioSource !== "computer";
  const member = useMemo(() => (user?.memberId ? { id: user.memberId, email: user.email ?? "" } : null), [user?.memberId, user?.email]);

  // ---- dock ----
  const [isOpen, setIsOpen] = useState(false);
  const [pinned, setPinned] = usePersistedState("dialer-pinned", false);

  // ---- lines ----
  const { data: phones } = useQuery<any[]>({ queryKey: ["twentyPhones"], queryFn: () => api.twentyPhones.list(), staleTime: 10_000, enabled: !!user });
  const { data: primary } = useQuery({ queryKey: ["primaryPhone"], queryFn: () => api.twentyPhones.primary(), staleTime: 60_000, enabled: !!user });
  const [lineId, setLineId] = usePersistedState<string>("dialer-line", "");
  const lines = useMemo<DialerLine[]>(() => {
    const free = (p: any) => !p.claimedByMemberId || p.claimedByMemberId === member?.id;
    return (phones ?? [])
      .filter((p) => !p.state || String(p.state).toUpperCase() === "ACTIVE")
      .filter(free)
      .map((p) => ({
        id: p.id,
        phoneNumber: p.phoneNumber,
        countryCode: p.countryCode ?? null,
        callState: p.callState ?? "IDLE",
        claimedByMemberId: p.claimedByMemberId ?? null,
      }));
  }, [phones, member?.id]);
  const line = useMemo(() => {
    const primaryId = (primary as any)?.phone?.id;
    return lines.find((l) => l.id === lineId) ?? lines.find((l) => l.id === primaryId) ?? lines[0] ?? null;
  }, [lines, lineId, primary]);

  // ---- call state ----
  const [state, setState] = useState<CallState>("idle");
  const [target, setTarget] = useState<DialTarget | null>(null);
  const [direction, setDirection] = useState<"outbound" | "inbound">("outbound");
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [held, setHeld] = useState(false);
  const [outcome, setOutcome] = useState("no_answer");
  const [notes, setNotesState] = useState("");
  const [notesSaved, setNotesSaved] = useState(true);
  /** Why the last notes autosave failed; the dock shows it with Retry. */
  const [notesError, setNotesError] = useState<string | null>(null);
  const [failure, setFailure] = useState<ClassifiedFailure | null>(null);
  const [cooldownNotice, setCooldownNotice] = useState<string | null>(null);
  const [recWarning, setRecWarning] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [registered, setRegistered] = useState(false);
  const [saving, setSaving] = useState(false);
  const [options, setOptions] = useState<DialOptions>({});

  const { data: recentCallRows } = useCalls();
  const recentCalls = useMemo(() => recentCallRows ?? [], [recentCallRows]);

  // Refs read by SIP callbacks, timers and unload (never stale).
  const agentRef = useRef<SipAgent | null>(null);
  const agentStarting = useRef<Promise<SipAgent | null> | null>(null);
  const sessionRef = useRef<any>(null);
  const lifecycleRef = useRef<CallLifecycle | null>(null);
  const stateRef = useRef<CallState>("idle");
  const outcomeRef = useRef(outcome);
  const durationRef = useRef(0);
  const establishedRef = useRef(false);
  const bridgeLegRef = useRef<string | null>(null);
  const unansweredRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSipStatusRef = useRef<number | null>(null);
  const iceFailedRef = useRef(false);
  // A dial held back by a check (24h cooldown, international call) until the
  // operator presses "Dial anyway"; `skip` lists the checks already confirmed.
  const overrideRef = useRef<{ target: DialTarget; options: DialOptions; skip: Set<"cooldown" | "abroad"> } | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  const setCallState = useCallback((next: CallState) => {
    stateRef.current = next;
    setState(next);
  }, []);
  useEffect(() => { outcomeRef.current = outcome; }, [outcome]);
  useEffect(() => { durationRef.current = duration; }, [duration]);

  // Call timer while the call is live; minimising the dock never stops it.
  useEffect(() => {
    if (!isLive(state)) return;
    const t = setInterval(() => setDuration((d) => d + 1), 1000);
    return () => clearInterval(t);
  }, [state]);

  // Play through the speaker chosen in Settings (Chromium; others use the default).
  useEffect(() => {
    const el = remoteAudioRef.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    el?.setSinkId?.(speakerId || "default").catch(() => sipLog.warn("audio", "selected speaker unavailable; using the default"));
  }, [speakerId, state]);

  const clearUnanswered = useCallback(() => {
    if (unansweredRef.current) clearTimeout(unansweredRef.current);
    unansweredRef.current = null;
  }, []);

  // ---- SIP agent: one per signed-in session ----
  const handleInvite = useCallback((session: any) => {
    if (stateRef.current !== "idle" && stateRef.current !== "ended") {
      // Busy on another call: decline rather than drop the live one.
      try { session.reject({ statusCode: 486 }); } catch { /* gone */ }
      return;
    }
    const identity = session.remoteIdentity;
    const number = identity?.uri?.user ?? "Unknown";
    setIncoming({ session, number, name: identity?.displayName || number });
    setIsOpen(true);
    session.stateChange.addListener((s: string) => {
      if (s === "Terminated") setIncoming((cur) => (cur?.session === session ? null : cur));
    });
  }, []);

  const ensureAgent = useCallback(async (): Promise<SipAgent | null> => {
    if (agentRef.current) return agentRef.current;
    if (agentStarting.current) return agentStarting.current;
    agentStarting.current = (async () => {
      try {
        const agent = await startAgent({
          onInvite: handleInvite,
          onRegistered: setRegistered,
          onDisconnect: () => {
            setRegistered(false);
            agentRef.current = null;
          },
        });
        agentRef.current = agent;
        setRegistered(true);
        return agent;
      } catch (err: any) {
        sipLog.error("register", `SIP agent failed to start: ${err?.message || err}`);
        setRegistered(false);
        return null;
      } finally {
        agentStarting.current = null;
      }
    })();
    return agentStarting.current;
  }, [handleInvite]);

  // Register after login so inbound calls ring while idle. Phone-audio mode
  // and ?simulate=1 never touch SIP.
  useEffect(() => {
    if (!user || phoneAudio || SIMULATE_CALLS || !isSipConfigured()) return;
    void ensureAgent();
  }, [user, phoneAudio, ensureAgent]);
  useEffect(() => () => {
    void agentRef.current?.stop();
    agentRef.current = null;
  }, []);

  // ---- helpers ----
  const finishCall = useCallback((finalOutcome?: string) => {
    clearUnanswered();
    const lc = lifecycleRef.current;
    lc?.stopHeartbeat();
    const o = finalOutcome ?? outcomeRef.current;
    if (finalOutcome) setOutcome(finalOutcome);
    sessionRef.current = null;
    setMuted(false);
    setHeld(false);
    setCallState("ended");
    void lc?.finalize(o, durationRef.current);
  }, [clearUnanswered, setCallState]);

  const failLoud = useCallback(async (f: ClassifiedFailure) => {
    const lc = lifecycleRef.current;
    if (lc) lc.lastFailure = f;
    setFailure(f);
    toastError(`Call failed: ${f.title}`, `${f.detail} Fix: ${f.hint}`);
    sipLog.error("app", `CALL FAILED: ${f.title}`, { kind: f.kind, detail: f.detail });
    finishCall("failed");
    await lc?.release();
  }, [finishCall, toastError]);

  const resetCall = useCallback(() => {
    lifecycleRef.current = null;
    sessionRef.current = null;
    establishedRef.current = false;
    bridgeLegRef.current = null;
    lastSipStatusRef.current = null;
    iceFailedRef.current = false;
    setTarget(null);
    setDirection("outbound");
    setDuration(0);
    setMuted(false);
    setHeld(false);
    setOutcome("no_answer");
    setNotesState("");
    setNotesSaved(true);
    setFailure(null);
    setRecWarning(null);
    setOptions({});
    setCallState("idle");
  }, [setCallState]);

  const onEstablished = useCallback((session: any) => {
    clearUnanswered();
    establishedRef.current = true;
    // An open media path is not proof a human answered (IVR and voicemail
    // open it too): default to `connected` and let the operator pick.
    setOutcome("connected");
    setCallState("active");
    lifecycleRef.current?.setPhoneActive();
    attachRemoteMedia(session, remoteAudioRef.current, () => { iceFailedRef.current = true; });
    void lifecycleRef.current?.startRecording(setRecWarning);
  }, [clearUnanswered, setCallState]);

  // ---- outbound ----
  const startPhoneAudio = useCallback(async (lc: CallLifecycle) => {
    const fail = async (title: string, detail: string) => {
      toastError(title, detail);
      bridgeLegRef.current = null;
      finishCall("failed");
      await lc.release();
    };
    const bridgeLine = await audioBridge.ensureReady(lc.ctx.fromNumber);
    if (!bridgeLine) return fail("Call not placed", "Your phone line is not connected.");
    try {
      const { contactLegId } = await api.audioSessions.dial(bridgeLine.id, { to: lc.ctx.toNumber, from: lc.ctx.fromNumber });
      bridgeLegRef.current = contactLegId;
      lc.markRecordedByBridge(contactLegId);
      const rowId = await lc.ensureRow();
      if (rowId) {
        // Without this stamp the recording webhook cannot find the call row.
        api.calls.update(rowId, { telnyxCallId: contactLegId }).catch((err) =>
          sipLog.error("app", `call-control id not saved on call ${rowId}: ${describeError(err).detail}`),
        );
      }
      setCallState("ringing");
    } catch (err: any) {
      await fail("Call not placed", err?.message || "The dialer could not ring this contact.");
    }
  }, [audioBridge, finishCall, setCallState, toastError]);

  // Follow the contact leg of a phone-audio call.
  useEffect(() => {
    const bridge = audioBridge.session;
    const leg = bridgeLegRef.current;
    if (!leg || !bridge) return;
    const lineDown = bridge.status === "ended" || bridge.status === "failed";
    if (bridge.contactLegId === leg && bridge.contactState === "answered" && stateRef.current !== "active") {
      establishedRef.current = true;
      setOutcome("connected");
      setCallState("active");
      lifecycleRef.current?.setPhoneActive();
    }
    if ((bridge.contactLegId === leg && bridge.contactState === "ended") || lineDown) {
      bridgeLegRef.current = null;
      finishCall(establishedRef.current ? outcomeRef.current : "no_answer");
    }
  }, [audioBridge.session, finishCall, setCallState]);

  const startSip = useCallback(async (lc: CallLifecycle) => {
    const cfg = getSipConfig();
    // Hanging up while the call is still being set up ends it at once; every
    // await below re-checks, so no INVITE leaves after the operator hung up.
    const hungUp = () => stateRef.current === "ended" || stateRef.current === "idle" || lifecycleRef.current !== lc;
    if (!isSipConfigured()) return failLoud(classifyFailure({ notConfigured: true }));
    if (!agentRef.current) {
      // Pre-flight: is the WS host reachable before burning 8s on a timeout?
      try {
        const u = new URL(cfg.wsUrl);
        const probe = await api.net.check(u.hostname, u.port || "443");
        if (!probe?.ok) return failLoud(classifyFailure({ wsCloseCode: 1006, wsUrl: cfg.wsUrl }));
      } catch (err: any) {
        sipLog.warn("netcheck", `probe failed (${err?.message || err}); dialling anyway`);
      }
    }
    if (hungUp()) return;
    const agent = await ensureAgent();
    if (hungUp()) return;
    if (!agent) return failLoud(classifyFailure({ timedOut: true, wsUrl: cfg.wsUrl }));
    try {
      // Mic permission check up front so a denial fails loudly, not mid-INVITE.
      const probeStream = await getMicStream(microphoneId);
      probeStream.getTracks().forEach((t) => t.stop());
    } catch {
      if (hungUp()) return;
      return failLoud(classifyFailure({ micDenied: true }));
    }
    if (hungUp()) return;
    try {
      const { UserAgent, Inviter, SessionState } = await loadSip();
      if (hungUp()) return;
      const targetUri = UserAgent.makeURI(`sip:${lc.ctx.toNumber}@${agent.domain}`);
      if (!targetUri) return failLoud(classifyFailure({ wsUrl: cfg.wsUrl }));
      const callerId = lc.ctx.fromNumber || cfg.callerId;
      const inviter = new Inviter(agent.ua, targetUri, {
        sessionDescriptionHandlerOptions: {
          constraints: { audio: microphoneId ? { deviceId: { exact: microphoneId } } : true, video: false },
        },
        extraHeaders: callerId ? [`P-Asserted-Identity: <sip:${callerId}@${agent.domain}>`] : [],
      } as any);
      sessionRef.current = inviter;
      inviter.stateChange.addListener((s: string) => {
        if (s === SessionState.Establishing) setCallState("ringing");
        if (s === SessionState.Established) onEstablished(inviter);
        if (s === SessionState.Terminated) {
          if (stateRef.current === "ended") return;
          if (!establishedRef.current) {
            const f = classifyFailure({
              sipStatusCode: lastSipStatusRef.current,
              iceFailed: iceFailedRef.current || undefined,
              wsUrl: cfg.wsUrl,
            });
            if (f.kind !== "UNKNOWN" && lastSipStatusRef.current && lastSipStatusRef.current >= 400 && lastSipStatusRef.current !== 486 && lastSipStatusRef.current !== 487) {
              lc.lastFailure = f;
              setFailure(f);
            }
          }
          finishCall(establishedRef.current ? outcomeRef.current : "no_answer");
        }
      });
      // requestDelegate is the documented path for INVITE responses in
      // sip.js 0.21; onAccept carries the Telnyx call-control-id.
      await inviter.invite({
        requestDelegate: {
          onAccept: (response: any) => {
            const ccid = response?.message?.getHeader?.("X-Telnyx-Call-Control-ID");
            if (ccid) {
              lc.telnyxCallControlId = String(ccid);
              sipLog.info("invite", "Telnyx call-control-id captured", { telnyxCallId: String(ccid) });
              void lc.startRecording(setRecWarning);
            } else {
              sipLog.warn("invite", "200 OK without X-Telnyx-Call-Control-ID header");
            }
          },
          onReject: (response: any) => {
            lastSipStatusRef.current = response?.message?.statusCode ?? null;
            sipLog.error("invite", `INVITE rejected: ${lastSipStatusRef.current} ${response?.message?.reasonPhrase ?? ""}`.trim());
          },
        },
      } as any);
      if (stateRef.current === "connecting") setCallState("ringing");
      sipLog.info("invite", "INVITE sent", { to: lc.ctx.toNumber });
      // Unanswered watchdog: cancel the INVITE and mark NO_ANSWER. The
      // Terminated listener then does the normal finalize.
      const timeoutSeconds = getUnansweredTimeoutSeconds();
      clearUnanswered();
      unansweredRef.current = setTimeout(() => {
        if (establishedRef.current || sessionRef.current !== inviter) return;
        sipLog.warn("session", `unanswered timeout (${timeoutSeconds}s) — cancelling INVITE, marking NO_ANSWER`);
        try { (inviter as any).cancel()?.catch?.(() => {}); } catch { /* already terminating */ }
      }, timeoutSeconds * 1000);
      lc.startHeartbeat(HEARTBEAT_INTERVAL_MS, () => isLive(stateRef.current));
    } catch (err: any) {
      // Hung up before the INVITE went out: sip.js rejects the pending offer
      // ("Peer connection closed"). That is the hang-up, not a failure.
      if (hungUp()) {
        sipLog.info("invite", "call ended before it connected");
        return;
      }
      sipLog.error("invite", `dial path threw: ${err?.message || err}`);
      await failLoud(classifyFailure({ sipStatusCode: lastSipStatusRef.current, wsUrl: cfg.wsUrl }));
    }
  }, [ensureAgent, failLoud, finishCall, microphoneId, onEstablished, setCallState, clearUnanswered]);

  const dial = useCallback(async (next: DialTarget, opts: DialOptions = {}) => {
    setIsOpen(true);
    if (isLive(stateRef.current)) {
      toastWarning("Already on a call", "Hang up first, then dial the next number.");
      return;
    }
    if (!next.phone) {
      toastWarning("No phone number", `${next.name || "This contact"} has no number to call.`);
      return;
    }
    const confirmed = overrideRef.current?.target === next ? overrideRef.current.skip : new Set<"cooldown" | "abroad">();
    const hold = (check: "cooldown" | "abroad", notice: string) => {
      overrideRef.current = { target: next, options: opts, skip: new Set([...confirmed, check]) };
      resetCall();
      setTarget(next);
      setOptions(opts);
      setCooldownNotice(notice);
    };
    // Per-number cooldown: a number dialled in the last 24h is not redialled
    // without "Dial anyway" (repeat dials burned real money on 2026-10-02).
    if (!SIMULATE_CALLS && !confirmed.has("cooldown") && isWithinCooldown(recentCalls, next.phone)) {
      const last = lastDialTo(recentCalls, next.phone);
      return hold("cooldown", `Already dialled ${next.phone} at ${last ? last.toLocaleString() : "earlier today"}. Cooldown is ${DIAL_COOLDOWN_HOURS}h.`);
    }
    // Same-country calling: a contact abroad is called from one of our numbers
    // in their country; with none, an international call needs "Dial anyway".
    const route = pickCallLine(lines, line, { number: next.phone, country: next.country });
    if (route.abroad && !confirmed.has("abroad")) {
      return hold("abroad", `${next.name || next.phone} is in ${route.toName ?? "another country"} and you have no free number there, so this is an international call from ${line?.phoneNumber ?? "your number"}.`);
    }
    const from = route.line;
    if (route.switched && from) {
      setLineId(from.id);
      toastInfo(`Calling from ${from.phoneNumber}`, `Your ${route.toName ?? "local"} number, so the call stays local.`);
    }
    overrideRef.current = null;
    setCooldownNotice(null);
    sipLog.clear();
    // An unsaved summary from the last call still holds its number: free it.
    if (lifecycleRef.current && stateRef.current === "ended") void lifecycleRef.current.release();
    resetCall();
    setTarget(next);
    setOptions(opts);
    const lc = new CallLifecycle({
      direction: "outbound",
      fromNumber: from?.phoneNumber ?? "",
      toNumber: next.phone,
      phoneId: from?.id ?? null,
      member,
      prospectId: next.contactType === "prospect" ? next.contactId : null,
      leadId: next.contactType === "lead" ? next.contactId : null,
      simulated: SIMULATE_CALLS,
    });
    const claim = await lc.claim();
    if (!claim.ok) {
      toastWarning("Number in use", `${claim.message}. It frees up when the holder wraps up.`);
      setCallState("idle");
      return;
    }
    lifecycleRef.current = lc;
    setCallState("connecting");
    sipLog.info("app", "dial requested", { to: next.phone, phoneId: from?.id ?? null });
    // The row exists (IN_PROGRESS) before the INVITE leaves.
    await lc.ensureRow();
    queryClient.invalidateQueries({ queryKey: ["twentyPhones"] });
    if (SIMULATE_CALLS) {
      sipLog.warn("app", "SIMULATED call (?simulate=1) — no SIP traffic");
      setTimeout(() => stateRef.current === "connecting" && setCallState("ringing"), 1500);
      setTimeout(() => {
        if (stateRef.current !== "ringing") return;
        establishedRef.current = true;
        setOutcome("connected");
        setCallState("active");
      }, 4000);
      return;
    }
    if (phoneAudio) return startPhoneAudio(lc);
    return startSip(lc);
  }, [line, lines, setLineId, member, phoneAudio, queryClient, recentCalls, resetCall, setCallState, startPhoneAudio, startSip, toastWarning, toastInfo]);

  const dialAnyway = useCallback(() => {
    const pending = overrideRef.current;
    if (!pending) return;
    // Same object as the held dial, so the checks it confirmed let it through.
    void dial(pending.target, pending.options);
  }, [dial]);

  // ---- in-call controls ----
  const hangup = useCallback(() => {
    if (bridgeLegRef.current && audioBridge.session) {
      // Phone audio: drop the contact; the operator's line stays up.
      bridgeLegRef.current = null;
      void api.audioSessions.hangup(audioBridge.session.id).catch((err) =>
        toastError("Contact not hung up", `${describeError(err).detail} End the call from your phone.`),
      );
    }
    const session = sessionRef.current;
    if (session) {
      try {
        if (establishedRef.current) session.bye();
        else if (session.cancel) session.cancel();
        else session.reject?.();
      } catch {
        try { session.dispose?.(); } catch { /* gone */ }
      }
    }
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    finishCall(establishedRef.current ? outcomeRef.current : "no_answer");
  }, [audioBridge.session, finishCall]);

  const mute = useCallback(() => {
    const pc: RTCPeerConnection | undefined = sessionRef.current?.sessionDescriptionHandler?.peerConnection;
    const next = !muted;
    pc?.getSenders().forEach((s) => { if (s.track?.kind === "audio") s.track.enabled = !next; });
    setMuted(next);
  }, [muted]);

  const hold = useCallback(async () => {
    const session = sessionRef.current;
    const next = !held;
    if (!session && !SIMULATE_CALLS) return;
    setHeld(next);
    setCallState(next ? "on_hold" : "active");
    if (!session) return;
    try {
      session.sessionDescriptionHandlerOptionsReInvite = { hold: next };
      await session.invite();
    } catch (err) {
      sipLog.error("session", `hold re-INVITE failed: ${(err as any)?.message || err}`);
      setHeld(!next);
      setCallState(next ? "active" : "on_hold");
    }
  }, [held, setCallState]);

  const sendDtmf = useCallback((tone: string) => sendSessionDtmf(sessionRef.current, tone), []);

  // ---- inbound ----
  const accept = useCallback(async () => {
    const call = incoming;
    if (!call) return;
    setIncoming(null);
    sipLog.clear();
    resetCall();
    setDirection("inbound");
    setTarget({ contactType: null, contactId: null, phone: call.number, name: call.name });
    const lc = new CallLifecycle({
      direction: "inbound",
      fromNumber: call.number,
      toNumber: line?.phoneNumber ?? "",
      phoneId: null,
      member,
      prospectId: null,
      leadId: null,
      simulated: SIMULATE_CALLS,
    });
    const ccid = call.session?.request?.getHeader?.("X-Telnyx-Call-Control-ID");
    if (ccid) lc.telnyxCallControlId = String(ccid);
    lifecycleRef.current = lc;
    sessionRef.current = call.session;
    setCallState("connecting");
    const { SessionState } = await loadSip();
    call.session.stateChange.addListener((s: string) => {
      if (s === SessionState.Established) onEstablished(call.session);
      if (s === SessionState.Terminated && stateRef.current !== "ended") finishCall(establishedRef.current ? outcomeRef.current : "no_answer");
    });
    try {
      await call.session.accept({
        sessionDescriptionHandlerOptions: {
          constraints: { audio: microphoneId ? { deviceId: { exact: microphoneId } } : true, video: false },
        },
      });
      void lc.ensureRow();
    } catch (err: any) {
      sipLog.error("session", `accept failed: ${err?.message || err}`);
      finishCall("failed");
    }
  }, [incoming, line, member, microphoneId, onEstablished, finishCall, resetCall, setCallState]);

  const decline = useCallback(() => {
    try { incoming?.session.reject({ statusCode: 486 }); } catch { /* gone */ }
    setIncoming(null);
  }, [incoming]);

  // ---- notes: autosave onto the call row ----
  const setNotes = useCallback((value: string) => {
    setNotesState(value);
    setNotesSaved(false);
  }, []);
  useEffect(() => {
    if (notesSaved) return;
    const lc = lifecycleRef.current;
    if (!lc || lc.ctx.simulated) {
      // Nothing to save to (no call row, or ?simulate=1).
      setNotesSaved(true);
      return;
    }
    const t = setTimeout(() => {
      lc.saveNotes(notes)
        .then(() => {
          setNotesSaved(true);
          setNotesError(null);
        })
        .catch((err) => setNotesError(describeError(err).detail));
    }, 800);
    return () => clearTimeout(t);
  }, [notes, notesSaved]);

  // ---- summary ----
  const saveSummary = useCallback(async () => {
    const lc = lifecycleRef.current;
    const t = target;
    const o = outcome;
    setSaving(true);
    try {
      if (lc && !lc.ctx.simulated) {
        try {
          await lc.wrapUp(o, notes);
        } catch (err) {
          toastError("Disposition not saved", `${describeError(err).detail} The hangup-time result is still on the call.`);
        }
      } else {
        await lc?.release();
      }
      // The disposition decides what the contact becomes (lib/call-outcome).
      const status = recordStatusForOutcome(o);
      if (status && t?.contactId && !SIMULATE_CALLS) {
        const update = t.contactType === "lead" ? api.leads.update(t.contactId, { status }) : api.prospects.update(t.contactId, { status });
        // A pipeline refusal (e.g. the contact is Converted) is expected: say why.
        await update.catch((err) => toastError("Contact status not updated", `The call was saved. ${describeError(err).detail}`));
      }
      ["calls", "twentyPhones", "contacts-page", "prospect", "lead", "leads"].forEach((key) =>
        queryClient.invalidateQueries({ queryKey: [key] }),
      );
      const after = options.onSaved;
      resetCall();
      after?.(o);
    } finally {
      setSaving(false);
    }
  }, [target, outcome, notes, options, queryClient, resetCall, toastError]);

  const discardSummary = useCallback(() => {
    void lifecycleRef.current?.release();
    overrideRef.current = null;
    setCooldownNotice(null);
    resetCall();
  }, [resetCall]);

  // Tab closed mid-call: React cleanup never runs, so flush with keepalive.
  useEffect(() => {
    const onHide = () => lifecycleRef.current?.flushOnHide(outcomeRef.current, durationRef.current);
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, []);

  const value = useMemo<DialerValue>(() => ({
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    toggle: () => setIsOpen((o) => !o),
    pinned,
    setPinned,
    lines,
    line,
    setLine: setLineId,
    registered,
    phoneAudio,
    state,
    target,
    direction,
    duration,
    muted,
    held,
    outcome,
    setOutcome,
    notes,
    setNotes,
    notesSaved,
    notesError,
    retryNotes: () => {
      setNotesError(null);
      setNotesSaved(false);
      setNotesState((n) => n + "");
    },
    failure,
    cooldownNotice,
    recWarning,
    incoming: incoming ? { number: incoming.number, name: incoming.name } : null,
    saveLabel: options.saveLabel ?? "Done",
    saving,
    session: sessionRef.current,
    dial,
    dialAnyway,
    hangup,
    mute,
    hold,
    sendDtmf,
    accept,
    decline,
    saveSummary,
    discardSummary,
  }), [isOpen, pinned, setPinned, lines, line, setLineId, registered, phoneAudio, state, target, direction, duration, muted, held,
    outcome, notes, setNotes, notesSaved, notesError, failure, cooldownNotice, recWarning, incoming, options.saveLabel, saving,
    dial, dialAnyway, hangup, mute, hold, sendDtmf, accept, decline, saveSummary, discardSummary]);

  return (
    <DialerContext.Provider value={value}>
      {children}
      <audio ref={remoteAudioRef} hidden />
    </DialerContext.Provider>
  );
}
