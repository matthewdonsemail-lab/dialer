import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Ban,
  Check,
  CheckCircle,
  Headphones,
  Mic,
  Monitor,
  Phone,
  PhoneCall,
  PhoneIncoming,
  PhoneOff,
  Star,
  type IconComponent,
} from "@/components/ui/icons";
import { Chip } from "@/components/ui/Chip";
import { InfoTip } from "@/components/ui/InfoTip";
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

/**
 * One audio source, in the app's card style: icon chip, bold title, a check
 * when selected, and the explanation behind the eye tooltip instead of
 * sentences in the card. A source the server cannot run yet shows a chip.
 */
function Option({
  value,
  current,
  onSelect,
  title,
  icon: Icon,
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
  icon: IconComponent;
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
      className={`rounded-[10px] border bg-[var(--ods-bg-primary)] transition-colors ${
        selected ? "border-[var(--ods-brand-600)] ring-2 ring-[var(--ods-brand-600)]" : "border-[var(--ods-border)] hover:border-[var(--ods-border-strong)]"
      }`}
    >
      <div
        role="radio"
        aria-checked={selected}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && onSelect(value)}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !disabled && (e.preventDefault(), onSelect(value))}
        className={`flex items-center gap-3 p-4 ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
      >
        <span
          className={`w-10 h-10 shrink-0 rounded-[10px] flex items-center justify-center ${
            disabled ? "bg-[var(--ods-bg-tertiary)] text-[var(--ods-text-tertiary)]" : "bg-blue-500/15 text-blue-600"
          }`}
        >
          <Icon className="w-5 h-5" />
        </span>
        <span className="flex-1 min-w-0 flex flex-wrap items-center gap-2">
          <span className={`text-[15px] font-semibold ${disabled ? "text-[var(--ods-text-secondary)]" : "text-[var(--ods-text-primary)]"}`}>{title}</span>
          {badge && (
            <Chip icon={Star} iconClassName="text-amber-500">
              {badge}
            </Chip>
          )}
          {disabled && disabledReason && (
            <Chip icon={AlertTriangle} iconClassName="text-amber-600" title={disabledReason}>
              Needs server setup
            </Chip>
          )}
        </span>
        <span onClick={(e) => e.stopPropagation()}>
          <InfoTip
            tip={{
              title,
              icon: Icon,
              what: description,
              key: greatIf.map((g) => ({ color: "#22c55e", label: g })),
              use: disabled && disabledReason ? disabledReason : "Great if any of the points above fit how you work.",
            }}
          />
        </span>
        <span
          className={`w-6 h-6 shrink-0 rounded-full border-2 flex items-center justify-center ${
            selected ? "border-[var(--ods-brand-600)] bg-[var(--ods-brand-600)] text-white" : "border-[var(--ods-border-strong)]"
          }`}
        >
          {selected && <Check className="w-3.5 h-3.5" />}
        </span>
      </div>
      {selected && children && <div className="px-4 pb-4 pt-1 border-t border-[var(--ods-border)] mt-0">{children}</div>}
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
      <span className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--ods-text-primary)] mb-1.5">
        {icon} {label}
        {note && (
          <span onClick={(e) => e.preventDefault()}>
            <InfoTip className="w-5 h-5" tip={{ title: label, what: note }} />
          </span>
        )}
      </span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-10 px-3 rounded-[8px] border border-[var(--ods-border-strong)] bg-[var(--ods-bg-primary)] text-[14px] text-[var(--ods-text-primary)] outline-none focus:border-[var(--ods-brand-500)] disabled:opacity-60"
      >
        <option value="">System default</option>
        {devices.map((d, i) => (
          <option key={d.deviceId || i} value={d.deviceId}>
            {d.label || `${label} ${i + 1}`}
          </option>
        ))}
      </select>
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
  const phoneSetupNote = config && !config.callMeAvailable ? `Not set up on the server yet: needs ${config.missing.join(", ")}.` : undefined;
  const lineLive = session && ["calling_agent", "waiting_dial_in", "ready"].includes(session.status);

  return (
    <div className="space-y-3">
      <Option
        value="computer"
        current={source}
        onSelect={setSource}
        title="Computer audio"
        icon={Monitor}
        badge="Most popular"
        description="Talk and listen through this computer's microphone and speakers, or a headset."
        greatIf={["You're at your desk with reliable internet", "You want a simple, all-in-one setup", "You use a USB or Bluetooth headset"]}
      >
        <div className="space-y-3">
          {permission !== "granted" && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[var(--ods-border)] bg-[var(--ods-bg-secondary)] px-3 py-2">
              <Chip icon={permission === "denied" ? Ban : Mic} iconClassName={permission === "denied" ? "text-red-600" : "text-amber-600"}>
                {permission === "denied" ? "Microphone blocked in this browser" : "Microphone not allowed yet"}
              </Chip>
              {permission === "denied" ? (
                <InfoTip tip={{ title: "Microphone blocked", icon: Mic, what: "Allow microphone access in your browser's site settings, then reload, to choose devices." }} />
              ) : (
                <button onClick={allowMicrophone} className="h-8 px-3 rounded-[8px] bg-[var(--ods-brand-600)] text-white text-[13px] font-semibold">
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
              className="h-10 px-5 rounded-full bg-[var(--ods-brand-600)] hover:opacity-90 text-white text-[14px] font-semibold"
            >
              {testing ? "Stop test" : "Test audio"}
            </button>
            <div className="flex-1 min-w-[160px] flex items-center gap-2">
              <div className="flex-1 h-3 rounded-full bg-[var(--ods-bg-tertiary)] overflow-hidden" role="meter" aria-label="Microphone level" aria-valuenow={Math.round(level * 100)}>
                <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-75" style={{ width: `${level * 100}%` }} />
              </div>
              <span className="text-[13px] font-semibold text-[var(--ods-text-secondary)] w-20">{testing ? "Speak now" : "Mic level"}</span>
              <InfoTip
                tip={{
                  title: "Test audio",
                  icon: Headphones,
                  what: "Plays a chime through your speaker and shows your microphone level for 6 seconds.",
                  key: [
                    { color: "#22c55e", label: "Bar moves when you speak", note: "mic works" },
                    { color: "#2563eb", label: "You hear a chime", note: "speaker works" },
                  ],
                }}
              />
            </div>
          </div>
          {testError && (
            <Chip icon={AlertTriangle} iconClassName="text-red-600" title={testError}>
              {testError}
            </Chip>
          )}
        </div>
      </Option>

      <Option
        value="call_me"
        current={source}
        onSelect={setSource}
        title="Phone: Call me"
        icon={PhoneIncoming}
        description="When you start dialing, the dialer rings your phone. Answer it, then hear and speak through your phone while you control calls from this screen."
        greatIf={["Browser audio is giving you trouble", "You're on the go or need a backup", "You prefer your mobile or office phone's sound"]}
        disabled={!config?.callMeAvailable}
        disabledReason={phoneSetupNote}
      >
        <label className="block max-w-sm">
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--ods-text-primary)] mb-1.5">
            <Phone className="w-3.5 h-3.5" /> Call me at
          </span>
          <input
            value={callMeNumber}
            onChange={(e) => setCallMeNumber(e.target.value.replace(/[^\d+]/g, ""))}
            placeholder="+15551234567"
            inputMode="tel"
            className={`w-full h-10 px-3 rounded-[8px] border bg-[var(--ods-bg-primary)] text-[14px] tabular-nums text-[var(--ods-text-primary)] outline-none ${
              callMeNumber && !numberValid ? "border-red-500" : "border-[var(--ods-border-strong)] focus:border-[var(--ods-brand-500)]"
            }`}
          />
          {callMeNumber && !numberValid && (
            <span className="block mt-1.5">
              <Chip icon={AlertTriangle} iconClassName="text-red-600">
                Use + country code, then the number
              </Chip>
            </span>
          )}
        </label>
      </Option>

      <Option
        value="dial_in"
        current={source}
        onSelect={setSource}
        title="Phone: Dial in"
        icon={PhoneCall}
        description="When you start dialing you'll see a number and a PIN. Call it from any phone and enter the PIN to connect."
        greatIf={["Browser audio is giving you trouble", "You're on the go or need a backup", "You prefer your mobile or office phone's sound"]}
        disabled={!config?.dialInAvailable}
        disabledReason={config && !config.dialInAvailable ? `Not set up on the server yet: needs ${config.missing.join(", ")}.` : undefined}
      >
        <div className="flex items-center gap-3">
          <div>
            <span className="block text-[13px] font-semibold text-[var(--ods-text-secondary)]">Dial-in number</span>
            <span className="block text-[22px] font-bold tabular-nums text-[var(--ods-text-primary)]">{config?.dialInNumber ?? "—"}</span>
          </div>
          <InfoTip tip={{ title: "Dial in", icon: PhoneCall, what: "Call this number from any phone. A 4-digit PIN is shown each time you start dialing; enter it to connect." }} />
        </div>
      </Option>

      {lineLive && (
        <div className="flex items-center justify-between gap-3 rounded-[10px] border border-[var(--ods-border)] bg-[var(--ods-bg-primary)] px-4 py-3">
          <Chip icon={session!.status === "ready" ? CheckCircle : Phone} iconClassName={session!.status === "ready" ? "text-emerald-600" : "text-amber-600"}>
            {session!.status === "ready" ? "Phone line connected" : "Connecting your phone line"}
          </Chip>
          <button onClick={end} className="h-8 px-3 rounded-[8px] border border-[var(--ods-border-strong)] text-[13px] font-semibold text-red-600 inline-flex items-center gap-1.5 hover:bg-red-500/10">
            <PhoneOff className="w-3.5 h-3.5" /> End line
          </button>
        </div>
      )}
    </div>
  );
}
