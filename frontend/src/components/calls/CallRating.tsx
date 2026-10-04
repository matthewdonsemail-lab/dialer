import React, { useMemo, useRef, useState, useCallback } from "react";
import { Play, Pause, Download, Phone } from "lucide-react";

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
    return <span className="text-[11px] text-[var(--ods-text-tertiary)]">—</span>;
  }
  const style = SENTIMENT_STYLES[(sentiment || "NEUTRAL").toUpperCase()] ?? SENTIMENT_STYLES.NEUTRAL;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[4px] border text-[11px] font-semibold ${style}`}>
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

/** "Call Quality Scores" panel (5 green bars, n/5 each). Empty state when not analyzed. */
export function CallQualityScores({
  scores,
  fallback,
}: {
  scores: QualityScores | null;
  fallback?: React.ReactNode;
}) {
  if (!scores) {
    return (
      <div className="rounded-[8px] border border-[var(--ods-border)] bg-[var(--ods-bg-secondary)] p-4 flex flex-col gap-2">
        <p className="text-[15px] font-semibold text-[var(--ods-text-primary)]">Call Quality Scores</p>
        {fallback ?? <p className="text-[13px] text-[var(--ods-text-secondary)]">Not analyzed yet.</p>}
      </div>
    );
  }
  return (
    <div className="rounded-[8px] border border-[var(--ods-border)] bg-[var(--ods-bg-secondary)] p-4 flex flex-col gap-2.5">
      <p className="text-[15px] font-semibold text-[var(--ods-text-primary)]">Call Quality Scores</p>
      {SCORE_ROWS.map((row) => {
        const value = scores[row.key] || 0;
        return (
          <div key={row.key} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
            <span className="text-[13px] text-[var(--ods-text-primary)] inline-flex items-center gap-1.5">
              {row.label}
              <span
                title={row.hint}
                aria-label={row.hint}
                className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-[var(--ods-text-tertiary)] text-[10px] text-[var(--ods-text-tertiary)] cursor-help"
              >
                ?
              </span>
            </span>
            <span className="text-[13px] font-medium text-[var(--ods-text-primary)] tabular-nums">{value}/5</span>
            <div className="col-span-2 h-2 rounded-full bg-[var(--ods-bg-tertiary)] overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--ods-success)]"
                style={{ width: `${(value / 5) * 100}%` }}
              />
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
export function WaveformPlayer({
  src,
  seed,
  detailHref,
  onErrorMessage,
}: {
  src: string;
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
  const bars = useMemo(() => waveformBars(seed), [seed]);

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
          {onErrorMessage ?? "Audio failed to load (0:00) — the Telnyx recording isn't attached yet. Reconcile the call, or check the webhook setup."}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[8px] border border-[var(--ods-border)] bg-[var(--ods-bg-secondary)] px-4 py-3 flex items-center gap-3">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onError={() => setFailed(true)}
      />
      <button
        onClick={toggle}
        aria-label={playing ? "Pause recording" : "Play recording"}
        className="shrink-0 w-10 h-10 rounded-full border border-[var(--ods-border)] bg-[var(--ods-bg-tertiary)] flex items-center justify-center text-[var(--ods-text-primary)] hover:bg-[var(--ods-border)] transition"
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
            className="flex-1 rounded-full"
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
      <select
        value={rate}
        onChange={(e) => changeRate(Number(e.target.value))}
        aria-label="Playback speed"
        title="Playback speed"
        className="shrink-0 bg-transparent text-[12px] font-semibold text-[var(--ods-text-primary)] outline-none cursor-pointer"
      >
        {[1, 1.25, 1.5, 2].map((r) => (
          <option key={r} value={r}>{r}x</option>
        ))}
      </select>
      <a
        href={src}
        download
        aria-label="Download recording"
        title="Download recording"
        className="shrink-0 w-9 h-9 rounded-full bg-[var(--ods-bg-tertiary)] flex items-center justify-center text-[var(--ods-text-primary)] hover:bg-[var(--ods-border)] transition"
      >
        <Download className="w-4 h-4" />
      </a>
      {detailHref && (
        <a
          href={detailHref}
          aria-label="Open call details"
          title="Open call details"
          className="shrink-0 w-9 h-9 rounded-full bg-[var(--ods-brand-500)] flex items-center justify-center text-white hover:brightness-110 transition"
        >
          <Phone className="w-4 h-4" />
        </a>
      )}
    </div>
  );
}
