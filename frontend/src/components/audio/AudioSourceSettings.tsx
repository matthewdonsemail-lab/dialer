import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Headphones, Mic, Phone, PhoneOff } from "@/components/ui/icons";
import { api } from "@/lib/api-client";
import { useAudioSettings, type AudioSource } from "@/hooks/use-audio-settings";
import { useAudioBridge } from "@/components/audio/AudioBridge";

const E164 = /^\+[1-9]\d{6,14}$/;

/** A short two-note chime as a WAV blob, so the test plays through the chosen speaker. */
function chimeUrl(): string {
  const rate = 44100;
  const seconds = 0.7;
  const n = Math.floor(rate * seconds);
  const buffer = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buffer);
  const str = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); str(8, "WAVE"); str(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const freq = t < seconds / 2 ? 660 : 880;
    const envelope = Math.min(1, t * 40) * Math.max(0, 1 - (t % (seconds / 2)) / (seconds / 2));
    v.setInt16(44 + i * 2, Math.sin(2 * Math.PI * freq * t) * envelope * 0.4 * 32767, true);
  }
  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}

const sinkSupported = typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;

function Option({
  value,
  current,
  onSelect,
  title,
  badge,
  description,
  greatIf,
  disabled,
  disabledReason,
  children,
}: {
  value: AudioSource;
  current: AudioSource;
  onSelect: (v: AudioSource) => void;
  title: string;
  badge?: string;
  description: string;
  greatIf: string[];
  disabled?: boolean;
  disabledReason?: string;
  children?: ReactNode;
}) {
  const selected = current === value;
  return (
    <div
      className={`rounded-[10px] border p-3.5 transition-colors ${
        selected ? "border-[var(--ods-brand-600)] ring-1 ring-[var(--ods-brand-600)]" : "border-[var(--ods-border)]"
      } ${disabled ? "opacity-60" : ""}`}
    >
      <label className={`flex items-start gap-3 ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}>
        <input
          type="radio"
          name="audio-source"
          checked={selected}
          disabled={disabled}
          onChange={() => onSelect(value)}
          className="mt-1 w-4 h-4 accent-[var(--ods-brand-600)]"
        />
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-2 text-[14px] font-semibold text-[var(--ods-text-primary)]">
            {title}
            {badge && (
              <span className="px-1.5 py-0.5 rounded-[4px] bg-[var(--ods-brand-50)] text-[10px] font-semibold uppercase tracking-wide text-[var(--ods-brand-700)] dark:bg-[var(--ods-brand-900)]/40 dark:text-[var(--ods-brand-300)]">
                {badge}
              </span>
            )}
          </span>
          <span className="block text-[12px] text-[var(--ods-text-secondary)] mt-0.5">{description}</span>
          <span className="block mt-1.5 text-[12px] text-[var(--ods-text-secondary)]">
            Great if:
            <span className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
              {greatIf.map((g) => (
                <span key={g} className="inline-flex items-center gap-1">
                  <Check className="w-3 h-3 text-emerald-600" /> {g}
                </span>
              ))}
            </span>
          </span>
          {disabled && disabledReason && <span className="block mt-1.5 text-[12px] text-amber-700">{disabledReason}</span>}
        </span>
      </label>
      {selected && children && <div className="mt-3 pl-7">{children}</div>}
    </div>
  );
}

function DeviceSelect({
  label,
  icon,
  value,
  devices,
  onChange,
  disabled,
  note,
}: {
  label: string;
  icon: ReactNode;
  value: string;
  devices: MediaDeviceInfo[];
  onChange: (id: string) => void;
  disabled?: boolean;
  note?: string;
}) {
  return (
    <label className="block">
      <span className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--ods-text-secondary)] mb-1">
        {icon} {label}
      </span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-9 px-2.5 rounded-[8px] border border-[var(--ods-border-strong)] bg-[var(--ods-bg-primary)] text-[13px] text-[var(--ods-text-primary)] outline-none focus:border-[var(--ods-brand-500)] disabled:opacity-60"
      >
        <option value="">System default</option>
        {devices.map((d, i) => (
          <option key={d.deviceId || i} value={d.deviceId}>
            {d.label || `${label} ${i + 1}`}
          </option>
        ))}
      </select>
      {note && <span className="block mt-1 text-[11px] text-[var(--ods-text-tertiary)]">{note}</span>}
    </label>
  );
}

/** Settings -> Audio Source: computer audio, Call me, or Dial in (WAVV's three options). */
export function AudioSourceSettings() {
  const { source, setSource, microphoneId, setMicrophoneId, speakerId, setSpeakerId, callMeNumber, setCallMeNumber } = useAudioSettings();
  const { session, end } = useAudioBridge();
  const { data: config } = useQuery({ queryKey: ["audio-config"], queryFn: () => api.audioSessions.config(), staleTime: 60_000 });

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [permission, setPermission] = useState<"unknown" | "granted" | "denied">("unknown");
  const [testing, setTesting] = useState(false);
  const [level, setLevel] = useState(0);
  const [testError, setTestError] = useState<string | null>(null);
  const stopTest = useRef<() => void>(() => {});

  const refresh = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const list = await navigator.mediaDevices.enumerateDevices();
    setDevices(list);
    if (list.some((d) => d.kind === "audioinput" && d.label)) setPermission("granted");
  }, []);

  useEffect(() => {
    void refresh();
    navigator.mediaDevices?.addEventListener?.("devicechange", refresh);
    return () => {
      navigator.mediaDevices?.removeEventListener?.("devicechange", refresh);
      stopTest.current();
    };
  }, [refresh]);

  const mics = devices.filter((d) => d.kind === "audioinput" && d.deviceId !== "default" && d.deviceId !== "communications");
  const speakers = devices.filter((d) => d.kind === "audiooutput" && d.deviceId !== "default" && d.deviceId !== "communications");

  const allowMicrophone = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setPermission("granted");
      await refresh();
    } catch {
      setPermission("denied");
    }
  };

  /** Test: live microphone level for 6 seconds plus a chime through the chosen speaker. */
  const runTest = async () => {
    stopTest.current();
    setTestError(null);
    setTesting(true);
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let frame = 0;
    const url = chimeUrl();
    const stop = () => {
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close().catch(() => {});
      URL.revokeObjectURL(url);
      setTesting(false);
      setLevel(0);
    };
    stopTest.current = stop;
    try {
      const audio = new Audio(url) as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
      if (speakerId && audio.setSinkId) await audio.setSinkId(speakerId);
      void audio.play().catch(() => {});
      stream = await navigator.mediaDevices.getUserMedia({ audio: microphoneId ? { deviceId: { exact: microphoneId } } : true });
      setPermission("granted");
      void refresh();
      ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const x of data) sum += ((x - 128) / 128) ** 2;
        setLevel(Math.min(1, Math.sqrt(sum / data.length) * 4));
        frame = requestAnimationFrame(tick);
      };
      tick();
      setTimeout(stop, 6000);
    } catch (err: any) {
      setTestError(
        err?.name === "NotAllowedError"
          ? "Microphone access is blocked. Allow it in your browser's site settings."
          : err?.name === "NotFoundError" || err?.name === "OverconstrainedError"
            ? "That microphone isn't connected. Pick another one."
            : `Test failed: ${err?.message || err}`,
      );
      stop();
    }
  };

  const numberValid = E164.test(callMeNumber.trim());
  const phoneSetupNote = config && !config.callMeAvailable ? `Not set up on the server yet (needs ${config.missing.join(", ")}).` : undefined;
  const lineLive = session && ["calling_agent", "waiting_dial_in", "ready"].includes(session.status);

  return (
    <div className="space-y-3">
      <p className="text-[12px] text-[var(--ods-text-secondary)]">
        Choose how you hear and speak on calls. Your choice stays the same until you change it here.
      </p>

      <Option
        value="computer"
        current={source}
        onSelect={setSource}
        title="Computer audio"
        badge="Most popular"
        description="Talk and listen through this computer's microphone and speakers, or a headset."
        greatIf={["You're at your desk with reliable internet", "You want a simple, all-in-one setup", "You use a USB or Bluetooth headset"]}
      >
        <div className="space-y-3">
          {permission !== "granted" && (
            <div className="flex flex-wrap items-center gap-2 rounded-[8px] bg-[var(--ods-bg-secondary)] px-3 py-2 text-[12px] text-[var(--ods-text-secondary)]">
              {permission === "denied"
                ? "Microphone access is blocked. Allow it in your browser's site settings to choose devices."
                : "Allow microphone access to see your device names."}
              {permission !== "denied" && (
                <button onClick={allowMicrophone} className="h-7 px-2.5 rounded-[6px] bg-[var(--ods-brand-600)] text-white text-[12px] font-medium">
                  Allow microphone
                </button>
              )}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <DeviceSelect label="Microphone" icon={<Mic className="w-3.5 h-3.5" />} value={microphoneId} devices={mics} onChange={setMicrophoneId} />
            <DeviceSelect
              label="Speaker"
              icon={<Headphones className="w-3.5 h-3.5" />}
              value={speakerId}
              devices={speakers}
              onChange={setSpeakerId}
              disabled={!sinkSupported}
              note={sinkSupported ? undefined : "This browser always uses your system's default speaker. Change it in your computer's sound settings."}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={testing ? () => stopTest.current() : runTest}
              className="h-9 px-4 rounded-full bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-[13px] font-semibold"
            >
              {testing ? "Stop test" : "Test"}
            </button>
            <div className="flex-1 min-w-[160px]">
              <div className="h-2 rounded-full bg-[var(--ods-bg-tertiary)] overflow-hidden" role="meter" aria-label="Microphone level" aria-valuenow={Math.round(level * 100)}>
                <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-75" style={{ width: `${level * 100}%` }} />
              </div>
              <span className="block mt-1 text-[11px] text-[var(--ods-text-tertiary)]">
                {testing ? "Speak now: the bar moves with your voice. You should also hear a chime." : "Plays a chime through your speaker and shows your microphone level."}
              </span>
            </div>
          </div>
          {testError && <p className="text-[12px] text-red-600">{testError}</p>}
        </div>
      </Option>

      <Option
        value="call_me"
        current={source}
        onSelect={setSource}
        title="Phone: Call me"
        description="When you start dialing, the dialer rings your phone. Answer it, then hear and speak through your phone while you control calls from this screen."
        greatIf={["Browser audio is giving you trouble", "You're on the go or need a backup", "You prefer your mobile or office phone's sound"]}
        disabled={!config?.callMeAvailable}
        disabledReason={phoneSetupNote}
      >
        <label className="block max-w-sm">
          <span className="block text-[12px] font-medium text-[var(--ods-text-secondary)] mb-1">Call me at</span>
          <input
            value={callMeNumber}
            onChange={(e) => setCallMeNumber(e.target.value.replace(/[^\d+]/g, ""))}
            placeholder="+15551234567"
            inputMode="tel"
            className={`w-full h-9 px-2.5 rounded-[8px] border bg-[var(--ods-bg-primary)] text-[13px] tabular-nums text-[var(--ods-text-primary)] outline-none ${
              callMeNumber && !numberValid ? "border-red-500" : "border-[var(--ods-border-strong)] focus:border-[var(--ods-brand-500)]"
            }`}
          />
          <span className={`block mt-1 text-[11px] ${callMeNumber && !numberValid ? "text-red-600" : "text-[var(--ods-text-tertiary)]"}`}>
            {callMeNumber && !numberValid ? "Use international format: + country code, then the number." : "International format, e.g. +15551234567."}
          </span>
        </label>
      </Option>

      <Option
        value="dial_in"
        current={source}
        onSelect={setSource}
        title="Phone: Dial in"
        description="When you start dialing you'll see a number and a PIN. Call it from any phone and enter the PIN to connect."
        greatIf={["Browser audio is giving you trouble", "You're on the go or need a backup", "You prefer your mobile or office phone's sound"]}
        disabled={!config?.dialInAvailable}
        disabledReason={config && !config.dialInAvailable ? `Not set up on the server yet (needs ${config.missing.join(", ")}).` : undefined}
      >
        <p className="text-[13px] text-[var(--ods-text-primary)]">
          Dial-in number: <b className="tabular-nums">{config?.dialInNumber ?? "—"}</b>
          <span className="block text-[12px] text-[var(--ods-text-secondary)] mt-0.5">Your PIN is shown each time you start dialing.</span>
        </p>
      </Option>

      {lineLive && (
        <div className="flex items-center justify-between gap-3 rounded-[10px] border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-700">
          <span className="flex items-center gap-2">
            <Phone className="w-3.5 h-3.5" />
            {session!.status === "ready" ? "Your phone line is connected." : "Connecting your phone line…"}
          </span>
          <button onClick={end} className="h-7 px-2.5 rounded-[6px] border border-emerald-500/40 font-medium flex items-center gap-1">
            <PhoneOff className="w-3 h-3" /> End line
          </button>
        </div>
      )}
    </div>
  );
}
