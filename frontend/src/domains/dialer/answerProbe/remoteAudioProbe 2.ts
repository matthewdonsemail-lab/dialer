import { sipLog } from "@/domains/dialer/sip";
import { FrameClassifier, type AudioFrame } from "@/domains/dialer/answerDetection";

/**
 * Listens to a call's incoming audio without playing it and turns it into
 * AudioFrames. Needs a live call, so it is verified on real calls rather than
 * unit tests; the maths it feeds (audioFrames.ts) and the decisions made from
 * the frames (answerAnalyzer.ts) are tested.
 *
 * Safe failure: if no audio reaches the analyser (a browser that does not pipe
 * remote WebRTC audio into Web Audio) every frame is silent, the analyzer ends
 * in "unsure" at its silent-pickup limit and the operator is connected, which
 * is the right thing when it cannot tell. A warning is logged so it can be found.
 */

export interface RemoteProbe {
  stop: () => void;
}

const WINDOW = 2048;
/** Live track, exactly-zero samples this long: worth a log line (it may be silence, or a pipeline that hears nothing). */
const WARN_AFTER_MS = 6000;

const WORKLET_SOURCE = `
class AnswerProbe extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor("answer-probe", AnswerProbe);
`;

export function startRemoteProbe(session: any, onFrame: (frame: AudioFrame) => void): RemoteProbe | null {
  const pc: RTCPeerConnection | undefined = session?.sessionDescriptionHandler?.peerConnection;
  if (!pc || typeof AudioContext === "undefined") {
    sipLog.warn("audio", "answer detection: no peer connection or Web Audio; connecting without screening");
    return null;
  }

  const stream = new MediaStream();
  const addTrack = (track: MediaStreamTrack | null | undefined) => {
    if (track && track.kind === "audio" && !stream.getTrackById(track.id)) stream.addTrack(track);
  };
  pc.getReceivers().forEach((r) => addTrack(r.track));
  const onTrack = (e: RTCTrackEvent) => addTrack(e.track);
  pc.addEventListener("track", onTrack);

  const ctx = new AudioContext();
  void ctx.resume().catch(() => {});
  // Chromium only feeds a remote stream into Web Audio while some media
  // element is also consuming it; a muted element is enough and stays silent.
  const keepAlive = new Audio();
  keepAlive.muted = true;
  keepAlive.srcObject = stream;
  void keepAlive.play().catch(() => {});

  const source = ctx.createMediaStreamSource(stream);
  const classifier = new FrameClassifier();
  const startedAt = performance.now();
  let silentSince: number | null = null;
  let warned = false;
  let stopped = false;
  const cleanups: Array<() => void> = [];

  const handleBuffer = (buf: Float32Array) => {
    if (stopped) return;
    const now = performance.now();
    let peak = 0;
    for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
    const track = stream.getAudioTracks()[0];
    if (peak === 0 && track && track.readyState === "live" && !track.muted) {
      silentSince ??= now;
      if (!warned && now - silentSince >= WARN_AFTER_MS) {
        warned = true;
        sipLog.warn("audio", "answer detection: the analyser has heard only digital silence for 6s");
      }
    } else {
      silentSince = null;
    }
    onFrame(classifier.classify(buf, ctx.sampleRate, now - startedAt));
  };

  const useAnalyser = () => {
    const analyser = ctx.createAnalyser();
    analyser.fftSize = WINDOW;
    source.connect(analyser);
    const buf = new Float32Array(WINDOW);
    const timer = setInterval(() => {
      analyser.getFloatTimeDomainData(buf);
      handleBuffer(buf);
    }, 40);
    cleanups.push(() => clearInterval(timer));
  };

  // Prefer an AudioWorklet: it is driven by the audio clock, so a background
  // tab is not throttled the way a timer is. Fall back to a polled analyser.
  void (async () => {
    try {
      if (!ctx.audioWorklet) throw new Error("no audioWorklet");
      const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: "application/javascript" }));
      try {
        await ctx.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }
      if (stopped) return;
      const node = new AudioWorkletNode(ctx, "answer-probe");
      const quiet = ctx.createGain();
      quiet.gain.value = 0;
      source.connect(node);
      node.connect(quiet);
      quiet.connect(ctx.destination);
      const acc = new Float32Array(WINDOW);
      let filled = 0;
      node.port.onmessage = (e: MessageEvent<Float32Array>) => {
        const chunk = e.data;
        if (filled + chunk.length > WINDOW) {
          handleBuffer(acc.subarray(0, filled));
          filled = 0;
        }
        acc.set(chunk, filled);
        filled += chunk.length;
        if (filled >= WINDOW) {
          handleBuffer(acc);
          filled = 0;
        }
      };
      cleanups.push(() => {
        node.port.onmessage = null;
        node.disconnect();
        quiet.disconnect();
      });
    } catch (err: any) {
      sipLog.info("audio", `answer detection: worklet unavailable (${err?.message || err}); polling instead`);
      if (!stopped) useAnalyser();
    }
  })();

  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      pc.removeEventListener("track", onTrack);
      cleanups.forEach((fn) => fn());
      try { source.disconnect(); } catch { /* already gone */ }
      keepAlive.pause();
      keepAlive.srcObject = null;
      void ctx.close().catch(() => {});
    },
  };
}
