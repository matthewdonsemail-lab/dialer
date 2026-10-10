import { getSipConfig, getSipDomain, getSipExtension } from "./sipConfig";
import { sipLog } from "./sipDiagnostics";

/**
 * The SIP side of the dialer, outside React: one UserAgent and Registerer for
 * the whole signed-in session (so inbound calls ring while idle), plus the
 * media helpers every call uses. sip.js is loaded lazily on first use.
 */

type SipModule = typeof import("sip.js");

let sipModule: Promise<SipModule> | null = null;
export function loadSip(): Promise<SipModule> {
  sipModule ??= import("sip.js");
  return sipModule;
}

export interface SipAgent {
  ua: any;
  registerer: any;
  domain: string;
  stop: () => Promise<void>;
}

const CONNECT_TIMEOUT_MS = 8000;

function withTimeout<T>(p: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${label} timeout`)), CONNECT_TIMEOUT_MS)),
  ]);
}

/**
 * Start the transport and REGISTER. Throws `transport timeout` or
 * `register timeout` after 8s so the caller can classify the failure.
 */
export async function startAgent(handlers: {
  onInvite: (session: any) => void;
  onDisconnect: (error?: Error) => void;
  onRegistered: (registered: boolean) => void;
}): Promise<SipAgent> {
  const { UserAgent, Registerer, RegistererState } = await loadSip();
  const cfg = getSipConfig();
  const domain = getSipDomain();
  const ua = new UserAgent({
    uri: UserAgent.makeURI(cfg.uri),
    displayName: cfg.callerId || undefined,
    transportOptions: { server: cfg.wsUrl || `wss://${domain}:5066` },
    authorizationUsername: getSipExtension(),
    authorizationPassword: cfg.password,
    // Telnyx answers without RTCP-MUX on some legs; "negotiate" accepts
    // muxed and non-muxed answers instead of failing with 488.
    sessionDescriptionHandlerFactoryOptions: {
      peerConnectionOptions: { rtcConfiguration: { rtcpMuxPolicy: "negotiate" } },
    } as any,
  });
  ua.delegate = {
    onInvite: handlers.onInvite,
    onConnect: () => sipLog.info("transport", "userAgent connected (transport up)"),
    onDisconnect: (error?: Error) => {
      sipLog.error("transport", `userAgent disconnected${error?.message ? `: ${error.message}` : ""}`);
      handlers.onDisconnect(error);
    },
  };
  const registerer = new Registerer(ua);
  registerer.stateChange.addListener((state: string) => {
    if (state === RegistererState.Registered) sipLog.info("register", "registered: inbound calls will ring");
    handlers.onRegistered(state === RegistererState.Registered);
  });
  await withTimeout(ua.start(), "transport");
  await withTimeout(registerer.register(), "register");
  sipLog.info("register", "REGISTER sent");
  return {
    ua,
    registerer,
    domain,
    stop: async () => {
      try { await registerer.unregister(); } catch { /* already gone */ }
      try { await ua.stop(); } catch { /* already stopped */ }
    },
  };
}

/** The microphone chosen in Settings, falling back to the default if it is unplugged. */
export async function getMicStream(microphoneId: string | null | undefined): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: microphoneId ? { deviceId: { exact: microphoneId } } : true,
    });
  } catch (err: any) {
    if (!microphoneId || (err?.name !== "OverconstrainedError" && err?.name !== "NotFoundError")) throw err;
    sipLog.warn("audio", "selected microphone unavailable; using the default");
    return navigator.mediaDevices.getUserMedia({ audio: true });
  }
}

/**
 * Attach the remote audio once the session is established. Pulls receivers
 * directly (tracks may already be there) and listens for late tracks. The
 * element is playback only; recording is Telnyx server-side.
 */
export function attachRemoteMedia(session: any, audio: HTMLAudioElement | null, onIceFailed: () => void) {
  try {
    const pc: RTCPeerConnection | undefined = session?.sessionDescriptionHandler?.peerConnection;
    if (!pc) sipLog.warn("audio", "no peerConnection at attach time — will retry on track event");
    const remoteStream = new MediaStream();
    const attachTrack = (track: MediaStreamTrack | null | undefined, origin: string) => {
      if (!track || track.kind !== "audio" || remoteStream.getTrackById(track.id)) return;
      remoteStream.addTrack(track);
      sipLog.info("audio", `remote audio track attached (${origin})`, { id: track.id, readyState: track.readyState });
    };
    if (pc) {
      pc.getReceivers().forEach((r) => attachTrack(r?.track, "receivers"));
      pc.addEventListener("track", (event: any) => {
        const tracks: MediaStreamTrack[] = event.streams?.[0]?.getAudioTracks?.() || (event.track ? [event.track] : []);
        tracks.forEach((t) => attachTrack(t, "track-event"));
        if (audio && event.streams?.[0] && !audio.srcObject) audio.srcObject = event.streams[0];
      });
      pc.addEventListener("iceconnectionstatechange", () => {
        sipLog.info("ice", `ice=${pc.iceConnectionState} conn=${pc.connectionState}`);
        if (pc.iceConnectionState === "failed") {
          sipLog.error("ice", "ICE failed — no workable media path (UDP blocked/symmetric NAT with no TURN?)");
          onIceFailed();
        }
      });
    }
    if (audio) {
      audio.srcObject = remoteStream;
      const played = audio.play() as Promise<void> | undefined;
      played?.catch?.((e: any) => sipLog.error("audio", `remote play() rejected (autoplay policy?): ${e?.message || e}`));
    }
  } catch (err: any) {
    sipLog.error("audio", `attachRemoteMedia threw: ${err?.message || err}`);
  }
}

/** Send DTMF in-band over SIP INFO (Telnyx accepts application/dtmf-relay). */
export function sendSessionDtmf(session: any, tone: string) {
  if (!session?.info) return;
  const body = { contentDisposition: "render", contentType: "application/dtmf-relay", content: `Signal=${tone}\r\nDuration=160` };
  session.info({ requestOptions: { body } }).catch?.(() => {});
}
