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
/** ?simulate=1&nobody=1: simulated parallel lines all ring out, to try the no-answer path. */
const SIMULATE_NOBODY = SIMULATE_CALLS && new URLSearchParams(window.location.search).get("nobody") === "1";

/**
 * Most numbers one member dials at once. Each line is its own outbound call
 * on Telnyx, so the batch stays well inside the account's concurrent-call
 * limit and its 20 calls per second per SIP username.
 */
export const MAX_PARALLEL_LINES = 5;

export type LegStatus = "dialing" | "ringing" | "answered" | "no_answer" | "failed";

/** One line of a parallel dial, as the dock shows it. */
export interface DialLeg {
  name: string;
  phone: string;
  fromNumber: string;
  status: LegStatus;
}

/** A parallel line inside the provider: one contact, one claimed number, one INVITE. */
interface Leg {
  target: DialTarget;
  lc: CallLifecycle;
  status: LegStatus;
  session: any;
  timer: ReturnType<typeof setTimeout> | null;
  done: boolean;
}

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
  /** LONG_CODE, TOLL_FREE or SHORT_CODE. */
  numberType: string | null;
  /** US texting registrations: 10DLC campaign (long codes), toll-free verification. */
  tenDlcCampaignId: string | null;
  tollFreeVerificationId: string | null;
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
  /** The lines of a parallel dial while they ring; empty for a single call. */
  legs: DialLeg[];
  /** How many lines can ring at once: free numbers, at most MAX_PARALLEL_LINES (1 on phone audio). */
  maxLines: number;
  // actions
  dial: (target: DialTarget, options?: DialOptions) => Promise<void>;
  /**
   * Rings up to `count` contacts at once, each from its own free number; the
   * first to answer is connected and the rest hang up. Returns how many of
   * `candidates` it went through (skipped ones included).
   */
  dialMany: (candidates: DialTarget[], count: number, options?: DialOptions) => number;
  dialAnyway: () => void;
  hangup: () => void;
  mute: () => void;
  hold: () => void;
  sendDtmf: (tone: string) => void;
  accept: () => Promise<void>;
  decline: () => void;
  /** Saves the call; `outcome` saves that disposition without waiting for it to be set first. */
  saveSummary: (outcome?: string) => Promise<void>;
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
        numberType: p.numberType ?? null,
        tenDlcCampaignId: p.tenDlcCampaignId ?? null,
        tollFreeVerificationId: p.tollFreeVerificationId ?? null,
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
  // Parallel lines: every leg of the batch, the one that answered, and
  // whether the operator stopped the batch (then nothing queues after it).
  const legsRef = useRef<Leg[]>([]);
  const winnerRef = useRef<Leg | null>(null);
  const stoppedRef = useRef(false);
  const batchOptionsRef = useRef<DialOptions>({});
  const [legs, setLegs] = useState<DialLeg[]>([]);
  const publishLegs = useCallback(() => {
    setLegs(legsRef.current.map((l) => ({ name: l.target.name, phone: l.target.phone, fromNumber: l.lc.ctx.fromNumber, status: l.status })));
  }, []);

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
    legsRef.current = [];
    winnerRef.current = null;
    setLegs([]);
    setCallState("idle");
  }, [setCallState]);

  // ---- results ----
  // The last call's number release, still in flight after "Done": the next
  // dial waits for it so it never claims a number the old call still holds.
  const pendingReleaseRef = useRef<Promise<unknown> | null>(null);

  /**
   * Write one finished call: show it in every loaded contact list at once,
   * then free the number, write the disposition and the contact's status in
   * the background. The summary uses it, and so does every parallel line
   * that rang out.
   */
  const recordResult = useCallback((lc: CallLifecycle | null, t: DialTarget | null, o: string, n: string) => {
    const status = recordStatusForOutcome(o);

    // Show the result in every loaded contact list right away.
    if (t?.contactId) {
      const at = new Date().toISOString();
      const patch = (row: any) =>
        row?.id === t.contactId ? { ...row, ...(status ? { status } : {}), lastCall: { id: lc?.callId ?? "pending", status: String(o).toUpperCase(), at } } : row;
      queryClient.setQueriesData({ queryKey: ["contacts-page"] }, (page: any) => (page?.rows ? { ...page, rows: page.rows.map(patch) } : page));
      queryClient.setQueriesData({ queryKey: ["dialer-contact-search"] }, (page: any) => (page?.rows ? { ...page, rows: page.rows.map(patch) } : page));
      // A list of contacts never called no longer includes this one.
      for (const [key, page] of queryClient.getQueriesData<any>({ queryKey: ["dialer-contact-search"] })) {
        const q = (key as unknown[])[1] as { lastCall?: string } | undefined;
        if (q?.lastCall === "__never" && page?.rows) {
          queryClient.setQueryData(key, { ...page, rows: page.rows.filter((r: any) => r.id !== t.contactId), totalCount: Math.max(0, (page.totalCount ?? 1) - 1) });
        }
      }
    }

    // The number first, on its own: the next dial waits for this and nothing else.
    const release = (lc?.release() ?? Promise.resolve()).catch(() => {});
    // Parallel lines release several numbers at once: the next dial waits for all of them.
    const before = pendingReleaseRef.current;
    const pending = before ? Promise.all([before, release]) : release;
    pendingReleaseRef.current = pending;
    void pending.then(() => {
      if (pendingReleaseRef.current === pending) pendingReleaseRef.current = null;
    });
    return (async () => {
      await release;
      if (lc && !lc.ctx.simulated) {
        try {
          await lc.wrapUp(o, n);
        } catch (err) {
          toastError("Disposition not saved", `${describeError(err).detail} The hangup-time result is still on the call.`);
        }
      } else {
        await lc?.release();
      }
      // The disposition decides what the contact becomes (lib/call-outcome).
      if (status && t?.contactId && !SIMULATE_CALLS) {
        const update = t.contactType === "lead" ? api.leads.update(t.contactId, { status }) : api.prospects.update(t.contactId, { status });
        // A pipeline refusal (e.g. the contact is Converted) is expected: say why.
        await update.catch((err) => toastError("Contact status not updated", `The call was saved. ${describeError(err).detail}`));
      }
      ["calls", "twentyPhones", "contacts-page", "prospect", "leads", "contacts-facets", "record-activity"].forEach((key) =>
        queryClient.invalidateQueries({ queryKey: [key] }),
      );
    })();
  }, [queryClient, toastError]);

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
    const rangRef = { current: false };
    let inviter: any = null;
    const startUnanswered = (seconds: number) => {
      clearUnanswered();
      unansweredRef.current = setTimeout(() => {
        if (establishedRef.current || !inviter || sessionRef.current !== inviter) return;
        sipLog.warn("session", `no answer after ${seconds}s${rangRef.current ? " of ringing" : ""}, cancelling the INVITE (No answer)`);
        try { inviter.cancel()?.catch?.(() => {}); } catch { /* already terminating */ }
      }, seconds * 1000);
    };
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
      inviter = new Inviter(agent.ua, targetUri, {
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
          onProgress: (response: any) => {
            const code = response?.message?.statusCode;
            if ((code === 180 || code === 183) && !rangRef.current) {
              rangRef.current = true;
              startUnanswered(getUnansweredTimeoutSeconds());
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
      // Terminated listener then does the normal finalize. The ringing time
      // is counted from the first ring (see onProgress), so carrier setup
      // does not eat into it; this backstop covers a call that never rings.
      if (!rangRef.current) startUnanswered(getUnansweredTimeoutSeconds() + 15);
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
    // The previous call may still be releasing this number in the background.
    if (pendingReleaseRef.current) await pendingReleaseRef.current;
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

  // ---- parallel lines ----
  // Each line claims its own number (409 when another member holds it), so
  // members dialling different lists at the same time never share a number,
  // and each line keeps its claim fresh with its own heartbeat.
  const maxLines = phoneAudio ? 1 : Math.max(1, Math.min(MAX_PARALLEL_LINES, lines.length));

  /** Nobody answered (or the operator stopped): every line is logged, the dock is free. */
  const endBatch = useCallback(() => {
    const stopped = stoppedRef.current;
    const after = stopped ? undefined : batchOptionsRef.current.onSaved;
    const count = legsRef.current.length;
    resetCall();
    if (!stopped) toastInfo("No one answered", `${count} lines rang out. Each is logged as No answer.`);
    after?.("no_answer");
  }, [resetCall, toastInfo]);

  /** A line that did not become the call: log it as No answer and free its number. */
  const closeLeg = useCallback((leg: Leg, outcome: "no_answer" | "failed") => {
    if (leg.done) return;
    leg.done = true;
    if (leg.timer) clearTimeout(leg.timer);
    leg.lc.stopHeartbeat();
    leg.status = outcome;
    // A line stopped before its call row existed was never dialled: only free its number.
    if (leg.lc.callId || leg.lc.ctx.simulated) void leg.lc.finalize(outcome, 0).then(() => recordResult(leg.lc, leg.target, outcome, ""));
    else void leg.lc.release();
    if (!legsRef.current.includes(leg)) return;
    publishLegs();
    if (!winnerRef.current && legsRef.current.every((l) => l.done)) endBatch();
  }, [endBatch, publishLegs, recordResult]);

  /** Hang up a line that is still ringing (or answered second). */
  const hangLeg = useCallback((leg: Leg) => {
    const session = leg.session;
    if (!session) return closeLeg(leg, "no_answer");
    try {
      if (leg.status === "answered") session.bye();
      else session.cancel();
    } catch {
      // Already ending: its Terminated listener closes the line.
    }
  }, [closeLeg]);

  /** The first line to answer becomes the call; every other line hangs up. */
  const legAnswered = useCallback((leg: Leg, session: any) => {
    if (winnerRef.current) {
      sipLog.warn("session", `a second line answered (${leg.target.phone}); hanging it up`);
      leg.status = "answered";
      hangLeg(leg);
      return;
    }
    winnerRef.current = leg;
    leg.status = "answered";
    if (leg.timer) clearTimeout(leg.timer);
    lifecycleRef.current = leg.lc;
    sessionRef.current = session;
    setTarget(leg.target);
    for (const other of legsRef.current) if (other !== leg && !other.done) hangLeg(other);
    publishLegs();
    if (session) onEstablished(session);
  }, [hangLeg, onEstablished, publishLegs]);

  const startLegs = useCallback(async (batch: Leg[]) => {
    const cfg = getSipConfig();
    const stop = (f: ClassifiedFailure) => {
      stoppedRef.current = true;
      setFailure(f);
      toastError(`Call failed: ${f.title}`, `${f.detail} Fix: ${f.hint}`);
      batch.forEach((l) => closeLeg(l, "failed"));
    };
    if (!isSipConfigured()) return stop(classifyFailure({ notConfigured: true }));
    const agent = await ensureAgent();
    if (stoppedRef.current) return;
    if (!agent) return stop(classifyFailure({ timedOut: true, wsUrl: cfg.wsUrl }));
    try {
      const probeStream = await getMicStream(microphoneId);
      probeStream.getTracks().forEach((t) => t.stop());
    } catch {
      return stop(classifyFailure({ micDenied: true }));
    }
    const { UserAgent, Inviter, SessionState } = await loadSip();
    for (const leg of batch) {
      if (stoppedRef.current || leg.done) continue;
      const uri = UserAgent.makeURI(`sip:${leg.lc.ctx.toNumber}@${agent.domain}`);
      if (!uri) {
        closeLeg(leg, "failed");
        continue;
      }
      const callerId = leg.lc.ctx.fromNumber || cfg.callerId;
      const inviter = new Inviter(agent.ua, uri, {
        sessionDescriptionHandlerOptions: {
          constraints: { audio: microphoneId ? { deviceId: { exact: microphoneId } } : true, video: false },
        },
        extraHeaders: callerId ? [`P-Asserted-Identity: <sip:${callerId}@${agent.domain}>`] : [],
      } as any);
      leg.session = inviter;
      const cancelAfter = (seconds: number) => {
        if (leg.timer) clearTimeout(leg.timer);
        leg.timer = setTimeout(() => {
          if (leg.done || winnerRef.current === leg) return;
          sipLog.warn("session", `no answer from ${leg.target.phone} after ${seconds}s, cancelling the line`);
          try { inviter.cancel()?.catch?.(() => {}); } catch { /* already ending */ }
        }, seconds * 1000);
      };
      let rang = false;
      inviter.stateChange.addListener((s: string) => {
        if (s === SessionState.Establishing && leg.status === "dialing") {
          leg.status = "ringing";
          publishLegs();
          if (stateRef.current === "connecting") setCallState("ringing");
        }
        if (s === SessionState.Established) legAnswered(leg, inviter);
        if (s === SessionState.Terminated) {
          if (winnerRef.current === leg) {
            if (stateRef.current !== "ended") finishCall(establishedRef.current ? outcomeRef.current : "no_answer");
            return;
          }
          closeLeg(leg, "no_answer");
        }
      });
      inviter
        .invite({
          requestDelegate: {
            onAccept: (response: any) => {
              const ccid = response?.message?.getHeader?.("X-Telnyx-Call-Control-ID");
              if (ccid) leg.lc.telnyxCallControlId = String(ccid);
              if (ccid && winnerRef.current === leg) void leg.lc.startRecording(setRecWarning);
            },
            onProgress: (response: any) => {
              const code = response?.message?.statusCode;
              if ((code === 180 || code === 183) && !rang) {
                rang = true;
                cancelAfter(getUnansweredTimeoutSeconds());
              }
            },
            onReject: (response: any) => {
              sipLog.error("invite", `line ${leg.lc.ctx.fromNumber} -> ${leg.target.phone} rejected: ${response?.message?.statusCode ?? ""} ${response?.message?.reasonPhrase ?? ""}`.trim());
            },
          },
        } as any)
        .catch((err: any) => {
          if (stoppedRef.current || leg.done) return;
          sipLog.error("invite", `line ${leg.target.phone} threw: ${err?.message || err}`);
          closeLeg(leg, "failed");
        });
      // Backstop for a line that never rings; ringing restarts it at the ring time.
      cancelAfter(getUnansweredTimeoutSeconds() + 15);
      leg.lc.startHeartbeat(HEARTBEAT_INTERVAL_MS, () => !leg.done && (winnerRef.current !== leg || isLive(stateRef.current)));
    }
    sipLog.info("invite", `${batch.length} lines dialling at once`);
  }, [closeLeg, ensureAgent, finishCall, legAnswered, microphoneId, publishLegs, setCallState, toastError]);

  const dialMany = useCallback((candidates: DialTarget[], count: number, opts: DialOptions = {}): number => {
    if (count <= 1 || phoneAudio) {
      const first = candidates.findIndex((c) => c.phone);
      if (first >= 0) void dial(candidates[first], opts);
      return first < 0 ? candidates.length : first + 1;
    }
    setIsOpen(true);
    if (isLive(stateRef.current)) {
      toastWarning("Already on a call", "Hang up first, then dial the next numbers.");
      return 0;
    }
    // One free number per line, local to each contact where there is one.
    const free = lines.filter((l) => (l.callState ?? "IDLE") === "IDLE");
    const used = new Set<string>();
    const plan: Array<{ target: DialTarget; from: DialerLine }> = [];
    const skipped: string[] = [];
    let consumed = 0;
    for (const c of candidates) {
      if (plan.length >= Math.min(count, MAX_PARALLEL_LINES)) break;
      const available = free.filter((l) => !used.has(l.id));
      if (!available.length) break;
      consumed++;
      if (!c.phone) continue;
      if (!SIMULATE_CALLS && isWithinCooldown(recentCalls, c.phone)) {
        skipped.push(`${c.name} (called in the last ${DIAL_COOLDOWN_HOURS}h)`);
        continue;
      }
      const preferred = available.find((l) => l.id === line?.id) ?? available[0];
      const route = pickCallLine(available, preferred, { number: c.phone, country: c.country });
      if (route.abroad || !route.line) {
        skipped.push(`${c.name} (no free number in ${route.toName ?? "their country"})`);
        continue;
      }
      used.add(route.line.id);
      plan.push({ target: c, from: route.line });
    }
    if (skipped.length) toastInfo(`Skipped ${skipped.length}`, skipped.join(", "));
    if (plan.length === 0) {
      toastWarning("Nothing to dial", free.length ? "No contact left in this list can be dialled." : "No free number to call from.");
      return consumed;
    }
    if (plan.length === 1) {
      void dial(plan[0].target, opts);
      return consumed;
    }

    void (async () => {
      overrideRef.current = null;
      setCooldownNotice(null);
      sipLog.clear();
      if (lifecycleRef.current && stateRef.current === "ended") void lifecycleRef.current.release();
      resetCall();
      stoppedRef.current = false;
      batchOptionsRef.current = opts;
      setOptions(opts);
      const batch: Leg[] = plan.map(({ target: t, from }) => ({
        target: t,
        status: "dialing",
        session: null,
        timer: null,
        done: false,
        lc: new CallLifecycle({
          direction: "outbound",
          fromNumber: from.phoneNumber,
          toNumber: t.phone,
          phoneId: from.id,
          member,
          prospectId: t.contactType === "prospect" ? t.contactId : null,
          leadId: t.contactType === "lead" ? t.contactId : null,
          simulated: SIMULATE_CALLS,
        }),
      }));
      legsRef.current = batch;
      publishLegs();
      setCallState("connecting");
      if (pendingReleaseRef.current) await pendingReleaseRef.current;
      const claims = await Promise.all(batch.map((l) => l.lc.claim()));
      const held = batch.filter((_, i) => !claims[i].ok);
      if (held.length) toastWarning(`${held.length} number${held.length === 1 ? "" : "s"} in use`, "Another member took it first; the other lines still dial.");
      const live = batch.filter((_, i) => claims[i].ok);
      if (legsRef.current !== batch) {
        // Hung up while claiming: give the numbers back.
        live.forEach((l) => void l.lc.release());
        return;
      }
      legsRef.current = live;
      if (!live.length) {
        resetCall();
        return;
      }
      publishLegs();
      sipLog.info("app", "parallel dial requested", { lines: live.map((l) => `${l.lc.ctx.fromNumber} -> ${l.target.phone}`) });
      await Promise.all(live.map((l) => l.lc.ensureRow()));
      queryClient.invalidateQueries({ queryKey: ["twentyPhones"] });
      if (legsRef.current !== live) return;
      if (SIMULATE_CALLS) {
        sipLog.warn("app", "SIMULATED parallel lines (?simulate=1) — no SIP traffic");
        setTimeout(() => {
          if (legsRef.current !== live) return;
          live.forEach((l) => { if (!l.done) l.status = "ringing"; });
          publishLegs();
          if (stateRef.current === "connecting") setCallState("ringing");
        }, 1500);
        setTimeout(() => {
          if (legsRef.current !== live || stateRef.current !== "ringing") return;
          if (SIMULATE_NOBODY) return live.forEach((l) => closeLeg(l, "no_answer"));
          const answering = live.find((l) => !l.done);
          if (!answering) return;
          establishedRef.current = true;
          legAnswered(answering, null);
          setOutcome("connected");
          setCallState("active");
        }, 4000);
        return;
      }
      await startLegs(live);
    })();
    return consumed;
  }, [closeLeg, dial, legAnswered, line, lines, member, phoneAudio, publishLegs, queryClient, recentCalls, resetCall, setCallState, startLegs, toastInfo, toastWarning]);

  // ---- in-call controls ----
  const hangup = useCallback(() => {
    if (legsRef.current.length && !winnerRef.current) {
      // Every line still ringing: stop them all, log each as No answer, queue nothing.
      stoppedRef.current = true;
      const ringing = legsRef.current.filter((l) => !l.done);
      if (!ringing.length) return endBatch();
      ringing.forEach(hangLeg);
      return;
    }
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
  }, [audioBridge.session, endBatch, finishCall, hangLeg]);

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
  /**
   * "Done": the dock moves on at once and the writes finish in the
   * background. Saving used to await the call update, recording reconcile,
   * number release, contact status and a refetch (8+ Twenty requests in a
   * row) before the queue advanced. Failures still toast.
   */
  const saveSummary = useCallback(async (picked?: string) => {
    const o = picked ?? outcome;
    const work = recordResult(lifecycleRef.current, target, o, notes);
    const after = options.onSaved;
    resetCall();
    after?.(o);
    await work;
  }, [target, outcome, notes, options, recordResult, resetCall]);

  const discardSummary = useCallback(() => {
    void lifecycleRef.current?.release();
    overrideRef.current = null;
    setCooldownNotice(null);
    resetCall();
  }, [resetCall]);

  // Tab closed mid-call: React cleanup never runs, so flush with keepalive.
  useEffect(() => {
    const onHide = () => {
      lifecycleRef.current?.flushOnHide(outcomeRef.current, durationRef.current);
      for (const leg of legsRef.current) if (!leg.done && leg !== winnerRef.current) leg.lc.flushOnHide("no_answer", 0);
    };
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
    legs,
    maxLines,
    dial,
    dialMany,
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
    legs, maxLines, dial, dialMany, dialAnyway, hangup, mute, hold, sendDtmf, accept, decline, saveSummary, discardSummary]);

  return (
    <DialerContext.Provider value={value}>
      {children}
      <audio ref={remoteAudioRef} hidden />
    </DialerContext.Provider>
  );
}
