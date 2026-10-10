import { useEffect, useRef, useState } from "react";

export interface ChartSeries {
  label: string;
  color: string;
  values: number[];
}

/** A "nice" axis maximum and tick list (0, 1, 2, 4 … or 0, 5, 10 …). */
function niceTicks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / 4;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? 10 * pow;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/**
 * Grouped bar chart drawn in SVG (no chart library). Hover a day to see the
 * exact value of every series; the legend names each colour.
 */
export function BarChart({
  labels,
  series,
  height = 220,
  valueFormat = fmt,
}: {
  labels: string[];
  series: ChartSeries[];
  height?: number;
  valueFormat?: (v: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  // Draw at the container's real width so text stays 11px on any screen
  // (a scaled viewBox shrinks the labels to unreadable on narrow layouts).
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.round(entry.contentRect.width))));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const pad = { top: 12, right: 12, bottom: 28, left: 40 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const max = Math.max(0, ...series.flatMap((s) => s.values));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const groupW = plotW / Math.max(1, labels.length);
  const barW = Math.min(18, (groupW * 0.7) / Math.max(1, series.length));
  const y = (v: number) => pad.top + plotH - (v / top) * plotH;
  // Roughly one label per 56px so day/name labels never collide.
  const labelEvery = Math.max(1, Math.ceil(labels.length / Math.max(1, Math.floor(plotW / 56))));

  return (
    <div className="relative" ref={boxRef}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block max-w-full" role="img" aria-label={series.map((s) => s.label).join(", ")}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke="var(--ods-border)" strokeDasharray="4 4" />
            <text x={pad.left - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--ods-text-tertiary)">
              {fmt(t)}
            </text>
          </g>
        ))}
        <line x1={pad.left} x2={pad.left} y1={pad.top} y2={pad.top + plotH} stroke="var(--ods-border-strong)" />
        {labels.map((label, i) => {
          const gx = pad.left + i * groupW;
          const groupBarsW = barW * series.length;
          return (
            <g key={label + i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={gx} y={pad.top} width={groupW} height={plotH} fill={hover === i ? "var(--ods-hover)" : "transparent"} />
              {series.map((s, si) => {
                const v = s.values[i] ?? 0;
                const h = Math.max(0, pad.top + plotH - y(v));
                return (
                  <rect
                    key={s.label}
                    x={gx + (groupW - groupBarsW) / 2 + si * barW}
                    y={pad.top + plotH - h}
                    width={barW - 2}
                    height={h}
                    rx={2}
                    fill={s.color}
                  />
                );
              })}
              {i % labelEvery === 0 && (
                <text x={gx + groupW / 2} y={height - 8} textAnchor="middle" fontSize="11" fill="var(--ods-text-tertiary)">
                  <title>{label}</title>
                  {label.length > 14 ? `${label.slice(0, 13)}…` : label}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {hover !== null && (
        <div
          className="pointer-events-none absolute top-1 z-10 min-w-[140px] rounded-md border border-[var(--ods-border-strong)] bg-[var(--ods-bg-primary)] px-2.5 py-2 shadow-lg text-[12px]"
          style={{
            left: `${((pad.left + (hover + 0.5) * groupW) / width) * 100}%`,
            transform: hover > labels.length / 2 ? "translateX(-105%)" : "translateX(5%)",
          }}
        >
          <div className="font-semibold text-[var(--ods-text-primary)] mb-1">{labels[hover]}</div>
          {series.map((s) => (
            <div key={s.label} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-[var(--ods-text-secondary)]">
                <span className="w-2 h-2 rounded-md" style={{ background: s.color }} />
                {s.label}
              </span>
              <span className="font-medium tabular-nums text-[var(--ods-text-primary)]">{valueFormat(s.values[hover] ?? 0)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-4 mt-1">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5 text-[12px] text-[var(--ods-text-secondary)]">
            <span className="w-2.5 h-2.5 rounded-md" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
