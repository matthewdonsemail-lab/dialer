import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioSettings } from "@/domains/dialer/audio";
import { getMicStream } from "@/domains/dialer/sip";
import { deleteVoicemail, loadVoicemail, saveVoicemail, type VoicemailRecording } from "./voicemailStore";

export type RecorderStatus = "idle" | "recording" | "saving" | "playing";

/** A voicemail longer than this is cut off: nobody listens past about 45 seconds. */
export const MAX_VOICEMAIL_MS = 45_000;
/** Shorter than this is a mis-click, not a message. */
export const MIN_VOICEMAIL_MS = 1500;

const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
}

/**
 * Record, preview and delete the voicemail Answer Boost leaves when a machine
 * answers. Recording uses the microphone chosen under Audio Source and is
 * kept in this browser.
 */
export function useOutboundVoicemail() {
  const { microphoneId, speakerId } = useAudioSettings();
  const [recording, setRecording] = useState<VoicemailRecording | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const cancelled = useRef(false);
  const startedAt = useRef(0);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);
  const meterFrame = useRef(0);
  const meterCtx = useRef<AudioContext | null>(null);
  const player = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let alive = true;
    loadVoicemail()
      .then((r) => alive && setRecording(r))
      .catch((err) => alive && setError(`Could not read your saved voicemail: ${err?.message || err}`))
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  const stopMeter = useCallback(() => {
    if (ticker.current) clearInterval(ticker.current);
    ticker.current = null;
    cancelAnimationFrame(meterFrame.current);
    void meterCtx.current?.close().catch(() => {});
    meterCtx.current = null;
    setLevel(0);
  }, []);

  const releaseMic = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);

  const finishRecording = useCallback(async () => {
    const mimeType = recorder.current?.mimeType || pickMimeType() || "audio/webm";
    const durationMs = Math.min(MAX_VOICEMAIL_MS, Date.now() - startedAt.current);
    stopMeter();
    releaseMic();
    recorder.current = null;
    if (cancelled.current) {
      setStatus("idle");
      return;
    }
    if (durationMs < MIN_VOICEMAIL_MS) {
      setError("That was too short. Record at least two seconds.");
      setStatus("idle");
      return;
    }
    setStatus("saving");
    try {
      const next: VoicemailRecording = { blob: new Blob(chunks.current, { type: mimeType }), mimeType, durationMs, recordedAt: new Date().toISOString() };
      await saveVoicemail(next);
      setRecording(next);
      setError(null);
    } catch (err: any) {
      setError(`Your voicemail was not saved: ${err?.message || err}`);
    } finally {
      setStatus("idle");
    }
  }, [releaseMic, stopMeter]);

  const start = useCallback(async () => {
    if (status !== "idle") return;
    setError(null);
    if (typeof MediaRecorder === "undefined") return setError("This browser cannot record audio.");
    try {
      const mic = await getMicStream(microphoneId);
      stream.current = mic;
      chunks.current = [];
      cancelled.current = false;
      const mimeType = pickMimeType();
      const rec = new MediaRecorder(mic, mimeType ? { mimeType } : undefined);
      recorder.current = rec;
      rec.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
      rec.onstop = () => void finishRecording();
      startedAt.current = Date.now();
      rec.start(250);
      setStatus("recording");
      setElapsedMs(0);

      // Live level, so it is obvious the microphone is picking you up.
      const ctx = new AudioContext();
      meterCtx.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(mic).connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      const tick = () => {
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (const x of buf) sum += x * x;
        setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 5));
        meterFrame.current = requestAnimationFrame(tick);
      };
      tick();
      ticker.current = setInterval(() => {
        const ms = Date.now() - startedAt.current;
        setElapsedMs(ms);
        if (ms >= MAX_VOICEMAIL_MS && recorder.current?.state === "recording") recorder.current.stop();
      }, 100);
    } catch (err: any) {
      releaseMic();
      stopMeter();
      setError(
        err?.name === "NotAllowedError"
          ? "Microphone access is blocked. Allow it in your browser's site settings, then try again."
          : `Could not start recording: ${err?.message || err}`,
      );
      setStatus("idle");
    }
  }, [finishRecording, microphoneId, releaseMic, status, stopMeter]);

  const stop = useCallback(() => {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);

  const cancel = useCallback(() => {
    cancelled.current = true;
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);

  const stopPlayback = useCallback(() => {
    player.current?.pause();
    if (player.current?.src) URL.revokeObjectURL(player.current.src);
    player.current = null;
    setStatus((s) => (s === "playing" ? "idle" : s));
  }, []);

  const play = useCallback(async () => {
    if (!recording || status !== "idle") return;
    setError(null);
    const audio = new Audio(URL.createObjectURL(recording.blob)) as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
    player.current = audio;
    audio.onended = stopPlayback;
    audio.onerror = () => {
      setError("Your voicemail could not be played.");
      stopPlayback();
    };
    try {
      if (speakerId && audio.setSinkId) await audio.setSinkId(speakerId).catch(() => {});
      setStatus("playing");
      await audio.play();
    } catch (err: any) {
      setError(`Could not play your voicemail: ${err?.message || err}`);
      stopPlayback();
    }
  }, [recording, speakerId, status, stopPlayback]);

  const remove = useCallback(async () => {
    try {
      await deleteVoicemail();
      setRecording(null);
      setError(null);
    } catch (err: any) {
      setError(`Your voicemail was not deleted: ${err?.message || err}`);
    }
  }, []);

  // Leaving the page mid-recording or mid-playback releases the microphone.
  useEffect(
    () => () => {
      cancelled.current = true;
      if (recorder.current?.state === "recording") recorder.current.stop();
      stopMeter();
      releaseMic();
      player.current?.pause();
    },
    [releaseMic, stopMeter],
  );

  return { recording, loaded, status, elapsedMs, level, error, start, stop, cancel, play, stopPlayback, remove };
}
