import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Headphones,
  Keyboard,
  Clock,
  RotateCcw,
  Check,
} from "lucide-react";
import { getSipConfig, isSipConfigured, getSipDomain, getSipExtension } from "@/sip";
import { sipLog, classifyFailure, getReport, type ClassifiedFailure } from "@/sip";
import { Button } from "@/components/ui/Button";
import { OutcomeSelect } from "@/components/common/OutcomeSelect";
import { api } from "@/lib/apiClient";
import type { Database } from "@/types/database";

// Explicit opt-in only: simulated calls NEVER happen silently. Ordinary dials
// fail loudly with the classified reason instead.
const SIMULATE_CALLS =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("simulate") === "1";

type Lead = Database["public"]["Tables"]["leads"]["Row"];

// NOTE: SIP credentials (VITE_SIP_*) bake in at `vite build` time — a Vercel
// redeploy without source changes may reuse a cached bundle with stale env.

export interface CallMember {
  id: string;
  email: string;
}

interface SoftphoneProps {
  lead: Lead | null;
  callerId?: string;
  /** agencyPhones row id — claimed in Twenty for the duration of the call */
  phoneId?: string | null;
  /** Signed-in Twenty member (the claimant) */
  member?: CallMember | null;
  prospectId?: string | null;
  leadId?: string | null;
  onCallEnd?: (outcome: {
    outcome: string;
    duration: number;
    notes: string;
    direction: "outbound" | "inbound";
    recordingUrl?: string | null;
    callId?: string | null;
  }) => void;
}

type CallState = "idle" | "connecting" | "ringing" | "active" | "on_hold" | "muted" | "ended";

const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ods-brand-500)] focus-visible:outline-offset-1";

export function Softphone({ lead, callerId, phoneId, member, prospectId, leadId, onCallEnd }: SoftphoneProps) {
  const [callState, setCallState] = useState<CallState>("idle");
  const [duration, setDuration] = useState(0);
  const [notes, setNotes] = useState("");
  const [outcome, setOutcome] = useState("no_answer");
  const [direction, setDirection] = useState<"outbound" | "inbound">("outbound");
  const [keypadVisible, setKeypadVisible] = useState(false);
  const [dialNumber, setDialNumber] = useState("");
  const [holdActive, setHoldActive] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [incomingCall, setIncomingCall] = useState<{
    callerNumber: string;
    callerName: string;
    session: any;
  } | null>(null);
  const [microphoneError, setMicrophoneError] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<ClassifiedFailure | null>(null);
  const [diagCopied, setDiagCopied] = useState(false);
  const [recWarning, setRecWarning] = useState<string | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionRef = useRef<any>(null);
  const inboundSessionRef = useRef<any>(null);
  const wasEstablishedRef = useRef(false);
  const callStateRef = useRef<CallState>("idle");
  // Claim + call-log refs (survive re-renders, used by cleanup paths)
  const holdRef = useRef<{ phoneId: string; memberId: string } | null>(null);
  const callLogIdRef = useRef<string | null>(null);
  const creatingRowRef = useRef<Promise<string | null> | null>(null);
  const finalizingRef = useRef(false);
  const startedAtRef = useRef<string | null>(null);
  const phoneNumberForCallRef = useRef<string>("");
  const telnyxCallControlIdRef = useRef<string | null>(null);
  const lastSipStatusRef = useRef<number | null>(null);
  const transportTimedOutRef = useRef(false);
  const iceFailedRef = useRef(false);
  const recordStartedRef = useRef(false);
  const lastFailureRef = useRef<ClassifiedFailure | null>(null);

  // Audio refs (playback only — recording is Telnyx server-side)
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const localAudioRef = useRef<HTMLAudioElement>(null);

  // Media refs
  const localStreamRef = useRef<MediaStream | null>(null);

  const phoneNumber = lead?.phone ?? dialNumber;

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  const outcomeRef = useRef(outcome);
  const durationRef = useRef(duration);
  const directionRef = useRef(direction);
  useEffect(() => { outcomeRef.current = outcome; }, [outcome]);
  useEffect(() => { durationRef.current = duration; }, [duration]);
  useEffect(() => { directionRef.current = direction; }, [direction]);

  // Cleanup media streams on unmount (release any held number)
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      stopLocalStream();
      const hold = holdRef.current;
      if (hold) {
        holdRef.current = null;
        api.twentyPhones.release(hold.phoneId, { memberId: hold.memberId }).catch(() => {});
      }
      if (inboundSessionRef.current) {
        try { inboundSessionRef.current.terminate(); } catch {}
        inboundSessionRef.current = null;
      }
    };
  }, []);

  // Duration timer
  useEffect(() => {
    if (callState === "active" || callState === "ringing" || callState === "connecting") {
      intervalRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [callState]);

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  // Get local microphone stream
  const getLocalStream = useCallback(async (): Promise<MediaStream> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      setMicrophoneError(null);
      return stream;
    } catch (err) {
      console.error("Failed to get local microphone:", err);
      setMicrophoneError("Microphone access denied. Please allow microphone permissions.");
      throw err;
    }
  }, []);

  const stopLocalStream = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
  }, []);

  // --- Twenty number claim (single holder per number, synced to SIP state) ---
  const claimNumber = useCallback(async (): Promise<boolean> => {
    if (!phoneId || !member) return true; // no number context: dial without a claim
    try {
      await api.twentyPhones.claim(phoneId, { memberId: member.id, memberEmail: member.email });
      holdRef.current = { phoneId, memberId: member.id };
      setClaimError(null);
      return true;
    } catch (err: any) {
      const message = err?.message || "Number is in use";
      setClaimError(message);
      return false;
    }
  }, [phoneId, member]);

  const setPhoneActive = useCallback(() => {
    const hold = holdRef.current;
    if (!hold) return;
    api.twentyPhones.setState(hold.phoneId, { memberId: hold.memberId, state: "ACTIVE" }).catch(() => {});
  }, []);

  const releaseNumber = useCallback(async (callId?: string | null) => {
    const hold = holdRef.current;
    if (!hold) return;
    holdRef.current = null;
    try {
      await api.twentyPhones.release(hold.phoneId, { memberId: hold.memberId, callId: callId ?? undefined });
    } catch {
      // best-effort: claim expires on next holder's claim path
    }
  }, []);

  const mapOutcomeToCallStatus = (o: string): string => {
    if (o === "answered") return "COMPLETED";
    if (o === "no_answer") return "NO_ANSWER";
    if (o === "busy") return "BUSY";
    if (o === "failed") return "FAILED";
    return "COMPLETED";
  };

  // Create the agencyCalls row once per call (guarded: SIP Terminated + manual end both land here).
  // NOTE: lead?.id is deliberately NOT used as agencyLeadId — on prospect pages
  // the `lead` prop carries a prospect record, and its id would violate the
  // agencyLead foreign key. Only the explicit leadId prop (real leads) is linked.
  const ensureCallRow = useCallback(async (): Promise<string | null> => {
    if (SIMULATE_CALLS) return null; // explicit sim mode never touches Twenty
    if (callLogIdRef.current) return callLogIdRef.current;
    if (creatingRowRef.current) return creatingRowRef.current;
    const pending = (async (): Promise<string | null> => {
      try {
        const row = await api.calls.create({
          direction: directionRef.current.toUpperCase(),
          status: "IN_PROGRESS",
          fromNumber: callerId || undefined,
          toNumber: phoneNumberForCallRef.current || undefined,
          startedAt: startedAtRef.current || undefined,
          agencyPhoneId: holdRef.current?.phoneId || phoneId || undefined,
          agencyProspectId: prospectId || undefined,
          agencyLeadId: leadId || undefined,
        });
        callLogIdRef.current = row?.id ?? null;
        return callLogIdRef.current;
      } catch (err) {
        console.error("Failed to create agencyCalls row:", err);
        return null;
      } finally {
        creatingRowRef.current = null;
      }
    })();
    creatingRowRef.current = pending;
    return pending;
  }, [callerId, phoneId, prospectId, leadId]);

  // Start Telnyx server-side recording (+transcription) for the live call.
  // Plain SIP-trunked calls are NOT auto-recorded — without this there is no
  // recording object and no call.recording.saved webhook afterwards.
  const maybeStartServerRecording = useCallback(async () => {
    if (SIMULATE_CALLS || recordStartedRef.current) return;
    const ccid = telnyxCallControlIdRef.current;
    const id = await ensureCallRow();
    if (!ccid || !id) return;
    recordStartedRef.current = true;
    try {
      // The /record endpoint reads the row fresh — stamp the call-control-id
      // first so it can find it (without this it 400s "no telnyxCallId").
      await api.calls.update(id, { telnyxCallId: ccid });
      const res = await api.calls.record(id);
      sipLog.info("invite", "server recording started", { telnyxRecordingId: res?.telnyxRecordingId ?? null });
    } catch (err: any) {
      recordStartedRef.current = false;
      const msg = `Server recording failed to start: ${err?.message || err}`;
      setRecWarning(msg);
      sipLog.error("invite", msg);
    }
  }, [ensureCallRow]);

  const finalizeCall = useCallback(async (finalOutcome: string, finalDuration: number, finalDirection: "outbound" | "inbound") => {
    if (SIMULATE_CALLS) return;
    // Sync guard: endCall and the SIP Terminated event race — whoever gets here
    // first owns finalization (async gap before row id exists is covered too).
    if (finalizingRef.current) return;
    finalizingRef.current = true;
    const report = getReport(getSipConfig(), lastFailureRef.current ?? {
      kind: "NONE", title: "No failure", detail: "Call ended without a classified failure.", hint: "",
    }, telnyxCallControlIdRef.current);
    const debugLog = JSON.stringify(report).slice(0, 8000);
    // Row created at dial time: patch it closed. Otherwise create it now.
    if (callLogIdRef.current) {
      try {
        await api.calls.update(callLogIdRef.current, {
          status: mapOutcomeToCallStatus(finalOutcome),
          endedAt: new Date().toISOString(),
          durationSeconds: finalDuration,
          telnyxCallId: telnyxCallControlIdRef.current || undefined,
          debugLog,
        });
      } catch (err) {
        console.error("Failed to close agencyCalls row:", err);
      }
      return;
    }
    try {
      const row = await api.calls.create({
        direction: finalDirection.toUpperCase(),
        status: mapOutcomeToCallStatus(finalOutcome),
        fromNumber: callerId || undefined,
        toNumber: phoneNumberForCallRef.current || undefined,
        startedAt: startedAtRef.current || undefined,
        endedAt: new Date().toISOString(),
        durationSeconds: finalDuration,
        telnyxCallId: telnyxCallControlIdRef.current || undefined,
        agencyPhoneId: holdRef.current?.phoneId || phoneId || undefined,
        agencyProspectId: prospectId || undefined,
        agencyLeadId: leadId || undefined,
        debugLog,
      });
      callLogIdRef.current = row?.id ?? null;
    } catch (err) {
      console.error("Failed to log call to agencyCalls:", err);
    }
  }, [callerId, phoneId, prospectId, leadId]);

  // Remote media attach — called on Established, when the peer connection
  // definitely exists. Follows the SIP.js attach-media pattern: pull receivers
  // directly (tracks may already be present) AND listen for late tracks.
  // Recording is Telnyx server-side only; this element is playback-only.
  const setupRemoteMedia = useCallback((session: any) => {
    try {
      const sdh: any = session?.sessionDescriptionHandler;
      const pc: RTCPeerConnection | undefined = sdh?.peerConnection;
      if (!pc) {
        sipLog.warn("audio", "no peerConnection at attach time — will retry on track event");
      }
      const remoteStream = new MediaStream();
      const attachTrack = (track: MediaStreamTrack | null | undefined, origin: string) => {
        if (!track || track.kind !== "audio") return;
        if (!remoteStream.getTrackById(track.id)) {
          remoteStream.addTrack(track);
          sipLog.info("audio", `remote audio track attached (${origin})`, {
            id: track.id, readyState: track.readyState, muted: track.muted, enabled: track.enabled,
          });
        }
      };
      if (pc) {
        pc.getReceivers().forEach((receiver) => attachTrack(receiver?.track, "receivers"));
        pc.addEventListener("track", (event: any) => {
          const tracks: MediaStreamTrack[] =
            event.streams?.[0]?.getAudioTracks?.() || (event.track ? [event.track] : []);
          tracks.forEach((t) => attachTrack(t, "track-event"));
          if (remoteAudioRef.current && event.streams?.[0] && !remoteAudioRef.current.srcObject) {
            remoteAudioRef.current.srcObject = event.streams[0];
          }
        });
        const logIce = () =>
          sipLog.info("ice", `ice=${pc.iceConnectionState} conn=${pc.connectionState}`);
        pc.addEventListener("iceconnectionstatechange", () => {
          logIce();
          if (pc.iceConnectionState === "failed") {
            iceFailedRef.current = true;
            sipLog.error("ice", "ICE failed — no workable media path (UDP blocked/symmetric NAT with no TURN?)");
          } else if (pc.iceConnectionState === "disconnected") {
            sipLog.warn("ice", "ICE disconnected — may recover, watching");
          } else if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
            sipLog.info("ice", "media path established");
          }
        });
        pc.addEventListener("connectionstatechange", logIce);
        logIce();
      }
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStream;
        const pr = remoteAudioRef.current.play() as unknown as Promise<void> | undefined;
        if (pr && typeof (pr as any).catch === "function") {
          (pr as Promise<void>).then(() =>
            sipLog.info("audio", "remote element playing", { paused: remoteAudioRef.current?.paused })
          ).catch((e: any) =>
            sipLog.error("audio", `remote play() rejected (autoplay policy?): ${e?.message || e}`)
          );
        } else {
          sipLog.info("audio", "remote element srcObject set", { paused: remoteAudioRef.current.paused });
        }
      }
    } catch (err: any) {
      sipLog.error("audio", `setupRemoteMedia threw: ${err?.message || err}`);
    }
  }, []);

  // Loud terminal failure: banner + console + agencyCalls row + release.
  // There is deliberately NO silent fallback — a failed dial must say why.
  const failLoud = useCallback(async (failure: ClassifiedFailure) => {
    lastFailureRef.current = failure;
    setFatalError(failure);
    setDiagCopied(false);
    sipLog.error("app", `CALL FAILED: ${failure.title}`, { kind: failure.kind, detail: failure.detail });
    await finalizeCall("failed", durationRef.current, directionRef.current);
    await releaseNumber(callLogIdRef.current);
    setCallState("ended");
  }, [finalizeCall, releaseNumber]);

  // Dev-only UI walkthrough (?simulate=1). Never runs silently.
  const startSimulatedCall = useCallback(() => {
    sipLog.warn("app", "SIMULATED call (?simulate=1) — no SIP traffic");
    setCallState("connecting");
    setTimeout(() => setCallState("ringing"), 1500);
    setTimeout(() => setCallState("active"), 4000);
  }, []);

  const startCall = useCallback(async () => {
    if (!phoneNumber) return;

    setClaimError(null);
    setFatalError(null);
    lastFailureRef.current = null;
    sipLog.clear();
    sipLog.info("app", `dial requested`, { to: phoneNumber, phoneId: phoneId ?? null });
    // Claim the sending number first: another member holding it blocks the dial
    const claimed = await claimNumber();
    if (!claimed) return;

    setCallState("connecting");
    setDuration(0);
    setNotes("");
    setOutcome("no_answer");
    wasEstablishedRef.current = false;
    callLogIdRef.current = null;
    creatingRowRef.current = null;
    finalizingRef.current = false;
    telnyxCallControlIdRef.current = null;
    lastSipStatusRef.current = null;
    transportTimedOutRef.current = false;
    iceFailedRef.current = false;
    recordStartedRef.current = false;
    setRecWarning(null);
    startedAtRef.current = new Date().toISOString();
    phoneNumberForCallRef.current = phoneNumber;
    setMicrophoneError(null);
    // Open the agencyCalls row now (IN_PROGRESS) — refs above must be set
    // first, otherwise the row is created with an empty number and the id is
    // cleared by the reset. The live call needs an id before Telnyx hands us
    // a call-control-id.
    await ensureCallRow();

    const sipConfig = getSipConfig();
    sipLog.info("app", "sip config", {
      uri: sipConfig.uri, wsUrl: sipConfig.wsUrl,
      callerId: sipConfig.callerId, provider: sipConfig.provider,
    });

    if (!isSipConfigured()) {
      if (SIMULATE_CALLS) {
        startSimulatedCall();
        return;
      }
      await failLoud(classifyFailure({ notConfigured: true }));
      return;
    }

    // Pre-flight: is the WS host:port reachable before burning 8s on timeout?
    try {
      const u = new URL(sipConfig.wsUrl);
      sipLog.info("netcheck", `probing ${u.hostname}:${u.port || "443"}`);
      const probe = await api.net.check(u.hostname, u.port || "443");
      sipLog.info("netcheck", `probe result`, probe as Record<string, unknown>);
      if (!probe?.ok) {
        await failLoud(classifyFailure({ wsCloseCode: 1006, wsUrl: sipConfig.wsUrl }));
        return;
      }
    } catch (err: any) {
      sipLog.warn("netcheck", `probe failed (${err?.message || err}); dialling anyway`);
    }

    try {
      const { UserAgent, Registerer, Inviter, SessionState } = await import("sip.js");

      // Get local mic stream first
      let localStream: MediaStream;
      try {
        localStream = await getLocalStream();
      } catch {
        await failLoud(classifyFailure({ micDenied: true }));
        return;
      }
      void localStream;

      const domain = getSipDomain();
      const target = UserAgent.makeURI(`sip:${phoneNumber}@${domain}`);
      if (!target) {
        setCallState("ended");
        return;
      }

      const extraHeaders: string[] = [];
      const effectiveCallerId = callerId || sipConfig.callerId;
      if (effectiveCallerId) {
        extraHeaders.push(`P-Asserted-Identity: <sip:${effectiveCallerId}@${domain}>`);
      }

      const userAgent = new UserAgent({
        uri: UserAgent.makeURI(sipConfig.uri),
        displayName: effectiveCallerId || undefined,
        transportOptions: {
          server: sipConfig.wsUrl || `wss://${domain}:5066`,
        },
        authorizationUsername: getSipExtension(),
        authorizationPassword: sipConfig.password,
        // Telnyx answers without RTCP-MUX on some legs; "negotiate" accepts
        // muxed and non-muxed answers instead of failing with 488.
        sessionDescriptionHandlerFactoryOptions: {
          peerConnectionOptions: {
            rtcConfiguration: { rtcpMuxPolicy: "negotiate" },
          },
        } as any,
      });

      userAgent.delegate = {
        onInvite: async (session: any) => {
          inboundSessionRef.current = session;
          const remoteIdentity = session.remoteIdentity;
          const fromUri = remoteIdentity?.uri?.user ?? remoteIdentity?.user ?? "Unknown";
          const displayName = remoteIdentity?.displayName ?? "";
          setIncomingCall({
            callerNumber: fromUri,
            callerName: displayName || fromUri,
            session,
          });
          setCallState("ringing");
          setDirection("inbound");
        },
        onConnect: () => {
          sipLog.info("transport", "userAgent connected (transport up)");
        },
        onDisconnect: (error?: Error) => {
          sipLog.error("transport", `userAgent disconnected${error?.message ? `: ${error.message}` : ""}`);
        },
      };

      // Best-effort transport state trail (object shape varies by sip.js build)
      try {
        const transport: any = (userAgent as any).transport;
        if (transport?.stateChange?.addListener) {
          transport.stateChange.addListener((state: string) => {
            sipLog.info("transport", `transport -> ${state}`);
          });
        }
      } catch {
        // non-fatal: delegate events still cover the story
      }

      const registerer = new Registerer(userAgent);

      const connectionTimeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("SIP connection timeout")), 8000)
      );

      try {
        await Promise.race([userAgent.start(), connectionTimeout]);
      } catch {
        transportTimedOutRef.current = true;
        sipLog.error("transport", "userAgent.start() timed out after 8s", { wsUrl: sipConfig.wsUrl });
        await failLoud(classifyFailure({ timedOut: true, wsUrl: sipConfig.wsUrl }));
        return;
      }
      try {
        await Promise.race([registerer.register(), connectionTimeout]);
        sipLog.info("register", "REGISTER accepted");
      } catch {
        transportTimedOutRef.current = true;
        sipLog.error("register", "register() timed out after 8s");
        await failLoud(classifyFailure({ timedOut: true, wsUrl: sipConfig.wsUrl }));
        return;
      }

      // NOTE: outgoing response callbacks live on requestDelegate passed to
      // invite() below — neither constructor `delegate` nor post-hoc assignment
      // fires onAccept/onReject on the Inviter in SIP.js 0.21.
      const inviter = new Inviter(userAgent, target, {
        sessionDescriptionHandlerOptions: {
          constraints: { audio: true, video: false },
        },
        extraHeaders,
      } as any);

      sessionRef.current = inviter;

      inviter.stateChange.addListener((state: string) => {
        if (state === SessionState.Established) {
          wasEstablishedRef.current = true;
          setCallState("active");
          setOutcome("answered");
          setPhoneActive();
          sipLog.info("session", "call established — attaching remote media");
          setupRemoteMedia(inviter);
          // Belt-and-suspenders: onAccept ordering isn't guaranteed, so also
          // trigger here (guarded — runs once).
          void maybeStartServerRecording();
        } else if (state === SessionState.Terminated) {
          if (!wasEstablishedRef.current && callStateRef.current === "ringing") {
            setOutcome("no_answer");
          }
          setCallState("ended");
          sipLog.info("session", "call terminated", {
            established: wasEstablishedRef.current,
            lastSipStatus: lastSipStatusRef.current,
          });
          // Never-established + observed SIP failure (or transport loss) => loud banner
          if (!wasEstablishedRef.current && !callLogIdRef.current) {
            const failure = classifyFailure({
              sipStatusCode: lastSipStatusRef.current,
              timedOut: transportTimedOutRef.current || undefined,
              iceFailed: iceFailedRef.current || undefined,
              wsUrl: getSipConfig().wsUrl,
            });
            if (failure.kind !== "UNKNOWN") {
              lastFailureRef.current = failure;
              setFatalError(failure);
              sipLog.error("app", `CALL FAILED: ${failure.title}`, { kind: failure.kind });
            }
          }
          void finalizeCall(outcomeRef.current, durationRef.current, directionRef.current);
        } else if (state === SessionState.Establishing) {
          setCallState("ringing");
          sipLog.info("session", "establishing (ringing)");
        }
      });

      try {
        // requestDelegate is the documented path for outgoing response
        // callbacks in SIP.js 0.21 (session.delegate assignment does not fire
        // onAccept/onReject on the Inviter — which is how we lost the
        // Telnyx call-control-id). onAccept captures it for server recording.
        await inviter.invite({
          requestDelegate: {
            onAccept: (response: any) => {
              try {
                const ccid = response?.message?.getHeader?.("X-Telnyx-Call-Control-ID");
                if (ccid) {
                  telnyxCallControlIdRef.current = String(ccid);
                  sipLog.info("invite", "Telnyx call-control-id captured", { telnyxCallId: String(ccid) });
                  void maybeStartServerRecording();
                } else {
                  sipLog.warn("invite", "200 OK without X-Telnyx-Call-Control-ID header");
                }
              } catch {
                // header read is best-effort
              }
            },
            onReject: (response: any) => {
              const code: number | null = response?.message?.statusCode ?? null;
              lastSipStatusRef.current = code;
              sipLog.error("invite", `INVITE rejected: ${code} ${response?.message?.reasonPhrase ?? ""}`.trim());
            },
          },
        } as any);
        setCallState("ringing");
        sipLog.info("invite", `INVITE sent`, { to: phoneNumber });
      } catch (err: any) {
        sipLog.error("invite", `invite() threw: ${err?.message || err}`);
        await failLoud(classifyFailure({
          sipStatusCode: lastSipStatusRef.current,
          timedOut: transportTimedOutRef.current || undefined,
          wsUrl: sipConfig.wsUrl,
        }));
        return;
      }
    } catch (err: any) {
      // Anything unexpected on the dial path fails loudly — never silently simulates.
      sipLog.error("app", `dial path threw: ${err?.message || err}`);
      await failLoud(classifyFailure({ wsUrl: getSipConfig().wsUrl }));
      return;
    }
  }, [phoneNumber, callerId, startSimulatedCall, getLocalStream, claimNumber, failLoud, ensureCallRow, maybeStartServerRecording]);

  const endCall = useCallback(async () => {
    stopLocalStream();

    if (sessionRef.current) {
      try {
        sessionRef.current.bye();
      } catch {
        try { sessionRef.current.terminate(); } catch {}
      }
      sessionRef.current = null;
    }
    if (inboundSessionRef.current) {
      try { inboundSessionRef.current.terminate(); } catch {}
      inboundSessionRef.current = null;
    }

    // Clear audio elements
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    if (localAudioRef.current) {
      localAudioRef.current.srcObject = null;
    }

    setIncomingCall(null);
    setCallState("ended");
    if (intervalRef.current) clearInterval(intervalRef.current);
    // Covers simulated calls (no SIP Terminated event) and user hangup:
    // guarded, so the SIP listener path won't double-log.
    void finalizeCall(outcomeRef.current, durationRef.current, directionRef.current);
  }, [stopLocalStream, finalizeCall]);

  const toggleMute = useCallback(() => {
    const isCurrentlyMuted = callState === "muted";
    setCallState(isCurrentlyMuted ? "active" : "muted");

    // Toggle actual microphone
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !isCurrentlyMuted;
      });
    }
  }, [callState]);

  const toggleHold = useCallback(async () => {
    if (callState === "active" || callState === "on_hold") {
      const session = sessionRef.current;
      if (!session) return;

      const isGoingOnHold = callState !== "on_hold";
      setHoldActive(isGoingOnHold);
      setCallState(isGoingOnHold ? "on_hold" : "active");

      if (isGoingOnHold) {
        // Put call on hold via SIP re-invite
        try {
          await session.pause();
          console.log("Call put on hold");
        } catch (err) {
          console.error("Failed to put call on hold:", err);
          setCallState("active");
          setHoldActive(false);
        }
      } else {
        // Resume call
        try {
          await session.resume();
          console.log("Call resumed");
        } catch (err) {
          console.error("Failed to resume call:", err);
        }
      }
    }
  }, [callState]);

  const handleSaveOutcome = useCallback(async () => {
    // Wrap-up ends the hold: first persist the final disposition onto the call
    // row (it was stamped at dial/end time with the hangup-time outcome). If
    // Telnyx server recording never started (no call-control-id captured),
    // reconcile against Telnyx by from/to/time window before releasing.
    const callId = callLogIdRef.current;
    if (callId) {
      api.calls.update(callId, { status: mapOutcomeToCallStatus(outcome) }).catch(() => {});
      api.calls.reconcile(callId).catch(() => {});
    }
    await releaseNumber(callId);
    if (onCallEnd) {
      onCallEnd({ outcome, duration, notes, direction, recordingUrl: null, callId });
    }

    // Reset state
    setCallState("idle");
    setDuration(0);
    setNotes("");
    setOutcome("no_answer");
    setDirection("outbound");
    setClaimError(null);
    setFatalError(null);
    setRecWarning(null);
    recordStartedRef.current = false;
    lastFailureRef.current = null;
    callLogIdRef.current = null;
    creatingRowRef.current = null;
    finalizingRef.current = false;
    startedAtRef.current = null;
  }, [onCallEnd, outcome, duration, notes, direction, releaseNumber]);

  const handleAcceptIncomingCall = useCallback(async () => {
    const session = inboundSessionRef.current;
    if (!session) return;

    try {
      // Get local mic stream
      const localStream = await getLocalStream();

      // Attach local tracks to the session
      const pc = session.sessionDescriptionHandler?.peerConnection;
      if (pc) {
        localStream.getAudioTracks().forEach(track => {
          pc.addTrack(track, localStream);
        });
      }

      await session.accept();
      setCallState("active");
      setIncomingCall(null);
    } catch (err) {
      console.warn("Failed to accept incoming call:", err);
    }
  }, [getLocalStream]);

  const handleRejectIncomingCall = useCallback(() => {
    const session = inboundSessionRef.current;
    if (!session) return;
    try {
      session.reject(486);
    } catch {}
    inboundSessionRef.current = null;
    setIncomingCall(null);
    setCallState("idle");
  }, []);

  const handleRedial = useCallback(() => {
    setCallState("idle");
    setDuration(0);
    setTimeout(() => startCall(), 300);
  }, [startCall]);

  const keypadKeys = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    ["*", "0", "#"],
  ];

  const stateLabel: Record<CallState, string> = {
    idle: "Ready",
    connecting: "Connecting...",
    ringing: incomingCall ? "Incoming Call..." : "Ringing...",
    active: incomingCall ? "In Call" : "Connected",
    on_hold: "On Hold",
    muted: "Muted",
    ended: "Call Ended",
  };

  const stateColor: Record<CallState, string> = {
    idle: "var(--ods-text-tertiary)",
    connecting: "var(--ods-brand-600)",
    ringing: "var(--ods-brand-600)",
    active: "var(--ods-success)",
    on_hold: "var(--ods-warning)",
    muted: "var(--ods-warning)",
    ended: "var(--ods-danger)",
  };

  if (!lead) {
    return (
      <div className="bg-[var(--ods-bg-secondary)] border border-[var(--ods-border)] rounded-ods-md p-6 h-[460px] flex items-center justify-center">
        <div className="text-center text-[var(--ods-text-tertiary)]">
          <Phone className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-[13px] font-medium">Select a lead to start a call</p>
          <p className="text-[11px] mt-1">Navigate to a lead detail page and use the dialer</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Hidden audio elements for playback */}
      <audio ref={remoteAudioRef} hidden />
      <audio ref={localAudioRef} hidden />

      <div className="bg-[var(--ods-bg-secondary)] border border-[var(--ods-border)] rounded-ods-md overflow-hidden h-[460px] flex flex-col">
        {/* 40px header, flat */}
        <div className="h-10 min-h-[40px] px-4 border-b border-[var(--ods-border)] flex items-center gap-3 shrink-0">
          <div className="w-6 h-6 rounded-full bg-[var(--ods-bg-tertiary)] flex items-center justify-center shrink-0">
            <Phone className="w-3.5 h-3.5 text-[var(--ods-text-secondary)]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-[var(--ods-text-primary)] truncate">
              {lead.first_name} {lead.last_name}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {callState !== "idle" && (
              <span className="flex items-center gap-1 text-[11px] text-[var(--ods-text-tertiary)]">
                <Clock className="w-3 h-3" />
                {formatDuration(duration)}
              </span>
            )}
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                callState === "active" || callState === "connecting" || callState === "ringing"
                  ? "animate-pulse"
                  : ""
              }`}
              style={{ backgroundColor: stateColor[callState] }}
            />
          </div>
        </div>

        <div className="p-4 flex flex-col gap-4 flex-1 overflow-y-auto">
          <p className="text-[12px] text-[var(--ods-text-tertiary)] truncate -mt-1">
            {lead.company ?? lead.email ?? "No contact info"}
          </p>

          {/* Microphone error */}
          {microphoneError && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-ods-sm p-2 text-[11px] text-red-600">
              {microphoneError}
            </div>
          )}

          {/* Number claim conflict */}
          {claimError && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-ods-sm p-2 text-[11px] text-amber-700">
              Number in use — {claimError}. It releases when the holder wraps up.
            </div>
          )}

          {/* Server recording could not start (call itself continues) */}
          {recWarning && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-ods-sm p-2 text-[11px] text-amber-700">
              {recWarning} — audio still works, but Telnyx won't store this call.
            </div>
          )}

          {/* Loud call failure: exact reason + one-click diagnostics */}
          {fatalError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-ods-sm p-2.5 text-[11px] text-red-700 flex flex-col gap-1.5">
              <p className="font-semibold text-[12px]">Call failed: {fatalError.title}</p>
              <p className="text-red-600">{fatalError.detail}</p>
              <p className="text-[11px] text-red-600/80">Fix: {fatalError.hint}</p>
              <button
                onClick={async () => {
                  const report = getReport(getSipConfig(), fatalError, telnyxCallControlIdRef.current);
                  try {
                    await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
                    setDiagCopied(true);
                    setTimeout(() => setDiagCopied(false), 2000);
                  } catch {
                    console.error("[sip] clipboard failed", report);
                  }
                }}
                className="self-start mt-0.5 px-2 py-1 rounded-[4px] border border-red-500/40 text-[11px] font-medium hover:bg-red-500/10 transition-colors"
              >
                {diagCopied ? "Copied ✓" : "Copy diagnostics"}
              </button>
            </div>
          )}

          <div className="text-center">
            <p className="text-[18px] font-semibold text-[var(--ods-text-primary)]">{phoneNumber || "—"}</p>
            <p className="text-[11px] mt-1 font-medium" style={{ color: stateColor[callState] }}>
              {stateLabel[callState]}
            </p>
          </div>

          <div className="flex items-center justify-center gap-4">
            {callState === "idle" || callState === "ended" ? (
              <button
                onClick={callState === "ended" ? handleRedial : startCall}
                disabled={!phoneNumber}
                className={`w-14 h-14 rounded-full bg-[var(--ods-success)] hover:bg-[#15803d] disabled:bg-[var(--ods-bg-tertiary)] disabled:text-[var(--ods-text-tertiary)] disabled:cursor-not-allowed flex items-center justify-center text-white transition ${FOCUS_RING}`}
              >
                {callState === "ended" ? <RotateCcw className="w-6 h-6" /> : <Phone className="w-6 h-6" />}
              </button>
            ) : (
              <>
                <button
                  onClick={endCall}
                  className={`w-14 h-14 rounded-full bg-[var(--ods-danger)] hover:bg-[#b91c1c] flex items-center justify-center text-white transition ${FOCUS_RING}`}
                >
                  <PhoneOff className="w-6 h-6" />
                </button>
                <button
                  onClick={toggleMute}
                  disabled={callState === "on_hold"}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition ${FOCUS_RING} ${
                    callState === "muted"
                      ? "bg-red-500/10 text-red-600"
                      : "bg-[var(--ods-bg-tertiary)] text-[var(--ods-text-secondary)] hover:bg-[var(--ods-border)]"
                  }`}
                  title={callState === "muted" ? "Unmute" : "Mute"}
                >
                  {callState === "muted" ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
                <button
                  onClick={toggleHold}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition ${FOCUS_RING} ${
                    callState === "on_hold"
                      ? "bg-amber-500/10 text-amber-600"
                      : "bg-[var(--ods-bg-tertiary)] text-[var(--ods-text-secondary)] hover:bg-[var(--ods-border)]"
                  }`}
                  title="Hold"
                >
                  <Headphones className="w-5 h-5" />
                </button>
              </>
            )}
          </div>

          <div className="flex justify-center">
            <button
              onClick={() => setKeypadVisible(!keypadVisible)}
              className={`p-2 rounded-ods-sm transition ${FOCUS_RING} ${
                keypadVisible
                  ? "bg-[var(--ods-brand-100)] text-[var(--ods-brand-700)]"
                  : "bg-[var(--ods-bg-tertiary)] text-[var(--ods-text-secondary)] hover:bg-[var(--ods-border)]"
              }`}
              title="Keypad"
            >
              <Keyboard className="w-4 h-4" />
            </button>
          </div>

          {keypadVisible && (
            <div className="grid grid-cols-3 gap-2 max-w-[200px] mx-auto">
              {keypadKeys.flat().map((key) => (
                <button
                  key={key}
                  onClick={() => setDialNumber((prev) => prev + key)}
                  className={`w-full aspect-square flex items-center justify-center bg-[var(--ods-bg-tertiary)] hover:bg-[var(--ods-border)] rounded-ods-sm text-[16px] font-semibold text-[var(--ods-text-primary)] transition ${FOCUS_RING}`}
                >
                  {key}
                </button>
              ))}
            </div>
          )}

          <div className="border-t border-[var(--ods-border)] pt-4 flex flex-col gap-3">
            <div>
              <label className="block text-[11px] font-medium text-[var(--ods-text-tertiary)] mb-1">Outcome</label>
              <OutcomeSelect
                value={outcome}
                onChange={(value) => setOutcome(value)}
                disabled={callState !== "ended"}
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[var(--ods-text-tertiary)] mb-1">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="ods-input resize-none"
                placeholder="Add call notes..."
              />
            </div>
            <Button
              variant="primary"
              size="lg"
              onClick={handleSaveOutcome}
              disabled={callState !== "ended"}
              className="w-full"
            >
              Save & Next
            </Button>
          </div>
        </div>
      </div>
      {incomingCall && (
        <IncomingCallBanner
          callerName={incomingCall.callerName}
          callerNumber={incomingCall.callerNumber}
          onAccept={handleAcceptIncomingCall}
          onReject={handleRejectIncomingCall}
        />
      )}
    </>
  );
}

function IncomingCallBanner({
  callerName,
  callerNumber,
  onAccept,
  onReject,
}: {
  callerName: string;
  callerNumber: string;
  onAccept: () => void;
  onReject: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-[var(--ods-bg-primary)] border border-[var(--ods-border)] rounded-ods-lg max-w-sm w-full p-6 text-center flex flex-col gap-4">
        <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto animate-pulse">
          <Phone className="w-8 h-8 text-[var(--ods-success)]" />
        </div>
        <div>
          <h3 className="text-[16px] font-semibold text-[var(--ods-text-primary)]">Incoming Call</h3>
          <p className="text-[13px] text-[var(--ods-text-secondary)]">{callerName || "Unknown"}</p>
          <p className="text-[13px] text-[var(--ods-text-tertiary)]">{callerNumber}</p>
        </div>
        <div className="flex items-center justify-center gap-6">
          <button
            onClick={onReject}
            className={`w-14 h-14 rounded-full bg-[var(--ods-danger)] hover:bg-[#b91c1c] flex items-center justify-center text-white transition ${FOCUS_RING}`}
          >
            <PhoneOff className="w-6 h-6" />
          </button>
          <button
            onClick={onAccept}
            className={`w-14 h-14 rounded-full bg-[var(--ods-success)] hover:bg-[#15803d] flex items-center justify-center text-white transition ${FOCUS_RING}`}
          >
            <Check className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
}