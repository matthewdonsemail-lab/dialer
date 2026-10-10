import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { SelectMenu } from "@/domains/ui/menu";
import { api } from "@/domains/api/client";
import { InfoTip } from "@/domains/ui/infoTip";
import { Play, Pause, Download, Phone } from "@/domains/ui/icons";

/** 1-5 quality dimensions stored as JSON in call.aiScores. */
export interface QualityScores {
  conversion: number;
  politeness: number;
  questioning: number;
  engagement: number;
  sentiment: number;
}

export function parseAiScores(raw: string | null | undefined): QualityScores | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    const num = (v: unknown): number | null => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.min(5, Math.max(1, Math.round(n))) : null;
    };
    const out: QualityScores = {
      conversion: num(p?.conversion) ?? 0,
      politeness: num(p?.politeness) ?? 0,
      questioning: num(p?.questioning) ?? 0,
      engagement: num(p?.engagement) ?? 0,
      sentiment: num(p?.sentiment) ?? 0,
    };
    if (Object.values(out).every((v) => v === 0)) return null;
    return out;
  } catch {
    return null;
  }
}

const SENTIMENT_STYLES: Record<string, string> = {
  POSITIVE: "text-green-600 border-green-500/30 bg-green-500/10",
  NEGATIVE: "text-red-600 border-red-500/30 bg-red-500/10",
  MIXED: "text-amber-600 border-amber-500/30 bg-amber-500/10",
  NEUTRAL: "text-[var(--ods-text-secondary)] border-[var(--ods-border)] bg-[var(--ods-bg-secondary)]",
};

/** Compact score + sentiment pill (history table, detail sidebars). */
export function RatingBadge({ sentiment, score }: { sentiment: string | null; score: number | null }) {
  if (score === null || score === undefined) {
    return <span className="text-[12px] text-[var(--ods-text-tertiary)]">—</span>;
  }
  const style = SENTIMENT_STYLES[(sentiment || "NEUTRAL").toUpperCase()] ?? SENTIMENT_STYLES.NEUTRAL;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[12px] font-semibold ${style}`}>
      {score}
      <span className="font-normal opacity-80">{(sentiment || "NEUTRAL").toLowerCase()}</span>
    </span>
  );
}

const SCORE_ROWS: Array<{ key: keyof QualityScores; label: string; hint: string }> = [
  { key: "conversion", label: "Conversion Probability", hint: "Likelihood this prospect converts, based on interest signals in the call." },
  { key: "politeness", label: "Politeness & Rapport", hint: "Agent courtesy and rapport building during the call." },
  { key: "questioning", label: "Questioning Effectiveness", hint: "Quality of discovery questions asked by the agent." },
  { key: "engagement", label: "Contact Engagement", hint: "How engaged and responsive the prospect was." },
  { key: "sentiment", label: "Sentiment", hint: "The prospect's overall feeling about the call." },
];

const SCORE_TONE = (v: number) =>
  v >= 4 ? { bar: "#22c55e", text: "text-emerald-600" } : v >= 3 ? { bar: "#f59e0b", text: "text-amber-600" } : { bar: "#ef4444", text: "text-red-600" };

/**
 * The five 1-5 call quality ratings as thick bars, coloured by score, each
 * with an eye tooltip saying what it measures. Renders bare so it can sit in
 * any report card. Shows `fallback` when the call has not been analyzed.
 */
export function CallQualityScores({
  scores,
  fallback,
}: {
  scores: QualityScores | null;
  fallback?: React.ReactNode;
}) {
  if (!scores) return <>{fallback ?? <p className="py-6 text-center text-[14px] text-[var(--ods-text-secondary)]">Not analyzed yet.</p>}</>;
  return (
    <div className="space-y-3.5">
      {SCORE_ROWS.map((row) => {
        const value = scores[row.key] || 0;
        const tone = SCORE_TONE(value);
        return (
          <div key={row.key}>
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-[14px] font-semibold text-[var(--ods-text-primary)]">{row.label}</span>
              <InfoTip
                className="w-5 h-5"
                tip={{
                  title: row.label,
                  what: row.hint,
                  formula: ["Transcript", "→", "AI", "=", `${value} / 5`],
                  key: [
                    { color: "#22c55e", label: "4-5", note: "strong" },
                    { color: "#f59e0b", label: "3", note: "okay" },
                    { color: "#ef4444", label: "1-2", note: "weak" },
                  ],
                }}
              />
              <span className={`ml-auto text-[15px] font-bold tabular-nums ${tone.text}`}>
                {value}
                <span className="text-[12px] font-semibold text-[var(--ods-text-tertiary)]"> / 5</span>
              </span>
            </div>
            <div className="h-3 rounded-md bg-[var(--ods-bg-tertiary)] overflow-hidden">
              <div className="h-full rounded-md" style={{ width: `${(value / 5) * 100}%`, background: tone.bar }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

/** Deterministic pseudo-waveform heights (0.15–1) seeded by the call id. Pure. */
function waveformBars(seed: string, count = 96): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    const r = ((h >>> 0) % 1000) / 1000;
    bars.push(0.15 + r * 0.85);
  }
  return bars;
}

/**
 * Waveform-style audio player. Real playback through the proxied Telnyx URL;
 * the bars are a deterministic visual (no peak data is stored) that fills
 * with progress and supports click-to-seek.
 */
/**
 * Recording player. Plays `src` (the call's permanent recordingUrl copy) and,
 * when that is missing or fails, asks the backend for a fresh Telnyx link for
 * `callId`. The backend route needs the Bearer token, which an <audio> element
 * cannot send, so the link is fetched first and then played directly.
 */
export function WaveformPlayer({
  src,
  callId,
  seed,
  detailHref,
  onErrorMessage,
}: {
  src?: string | null;
  /** Call with a Telnyx recording, used as the fallback source. */
  callId?: string | null;
  seed: string;
  detailHref?: string;
  onErrorMessage?: string;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const barsRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);
  const [failed, setFailed] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [audioSrc, setAudioSrc] = useState<string | null>(src || null);
  const [triedTelnyx, setTriedTelnyx] = useState(false);
  const bars = useMemo(() => waveformBars(seed), [seed]);

  const fromTelnyx = useCallback(() => {
    if (!callId) {
      setFailed(true);
      return;
    }
    setTriedTelnyx(true);
    api.calls
      .audioUrl(callId)
      .then(({ url }) => setAudioSrc(url))
      .catch((err: Error) => {
        setReason(err.message);
        setFailed(true);
      });
  }, [callId]);

  // New call: start again from the stored copy, else go straight to Telnyx.
  useEffect(() => {
    setFailed(false);
    setReason(null);
    setTriedTelnyx(false);
    setPlaying(false);
    setCurrent(0);
    setDuration(0);
    setAudioSrc(src || null);
    if (!src) fromTelnyx();
  }, [src, fromTelnyx]);

  const onAudioError = () => {
    if (!triedTelnyx && callId) fromTelnyx();
    else setFailed(true);
  };

  const toggle = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => setFailed(true));
    else el.pause();
  }, []);

  const seek = useCallback((e: React.MouseEvent) => {
    const el = audioRef.current;
    const box = barsRef.current?.getBoundingClientRect();
    if (!el || !box || !Number.isFinite(el.duration) || el.duration <= 0) return;
    const ratio = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
    el.currentTime = ratio * el.duration;
    setCurrent(el.currentTime);
  }, []);

  const changeRate = useCallback((value: number) => {
    setRate(value);
    if (audioRef.current) audioRef.current.playbackRate = value;
  }, []);

  const progress = duration > 0 ? current / duration : 0;
  const playedCount = Math.floor(progress * bars.length);

  if (failed) {
    return (
      <div className="rounded-[8px] border border-[var(--ods-border)] bg-[var(--ods-bg-secondary)] p-4">
        <p className="text-[12px] text-amber-700">
          {reason
            ? `Recording could not be loaded: ${reason}.`
            : onErrorMessage ?? "Recording could not be loaded. Reconcile the call with Telnyx, or check the webhook setup."}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[8px] border border-[var(--ods-border)] bg-[var(--ods-bg-secondary)] px-4 py-3 flex items-center gap-3">
      <audio
        ref={audioRef}
        src={audioSrc ?? undefined}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onError={onAudioError}
      />
      <button
        onClick={toggle}
        aria-label={playing ? "Pause recording" : "Play recording"}
        className="shrink-0 w-10 h-10 rounded-md border border-[var(--ods-border)] bg-[var(--ods-bg-tertiary)] flex items-center justify-center text-[var(--ods-text-primary)] hover:bg-[var(--ods-border)] transition"
      >
        {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
      </button>
      <div
        ref={barsRef}
        onClick={seek}
        title="Click to seek"
        className="flex-1 flex items-center gap-[2px] h-10 cursor-pointer"
        role="slider"
        aria-label="Seek recording"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(current)}
      >
        {bars.map((height, i) => (
          <span
            key={i}
            className="flex-1 rounded-md"
            style={{
              height: `${height * 100}%`,
              backgroundColor: i < playedCount ? "var(--ods-success)" : "var(--ods-border)",
              opacity: i < playedCount ? 1 : 0.7,
            }}
          />
        ))}
      </div>
      <span className="shrink-0 text-[12px] tabular-nums text-[var(--ods-text-secondary)]">
        {formatTime(current)} / {formatTime(duration)}
      </span>
      <SelectMenu
        value={String(rate)}
        onChange={(v) => changeRate(Number(v))}
        width={120}
        placement="top-end"
        sections={[{ title: "Speed", options: [1, 1.25, 1.5, 2].map((r) => ({ value: String(r), label: `${r}x` })) }]}
        triggerTitle="Playback speed"
        triggerClassName="shrink-0 h-8 px-2 rounded-[8px] hover:bg-[var(--ods-hover)] text-[12px] font-semibold text-[var(--ods-text-primary)] tabular-nums"
        trigger={<>{rate}x</>}
      />
      <a
        href={audioSrc ?? undefined}
        download
        aria-label="Download recording"
        title="Download recording"
        className="shrink-0 w-9 h-9 rounded-md bg-[var(--ods-bg-tertiary)] flex items-center justify-center text-[var(--ods-text-primary)] hover:bg-[var(--ods-border)] transition"
      >
        <Download className="w-4 h-4" />
      </a>
      {detailHref && (
        <a
          href={detailHref}
          aria-label="Open call details"
          title="Open call details"
          className="shrink-0 w-9 h-9 rounded-md bg-[var(--ods-brand-500)] flex items-center justify-center text-white hover:brightness-110 transition"
        >
          <Phone className="w-4 h-4" />
        </a>
      )}
    </div>
  );
}
