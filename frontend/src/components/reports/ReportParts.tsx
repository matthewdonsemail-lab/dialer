import type { ReactNode } from "react";
import type { IconComponent } from "@/components/ui/icons";

/**
 * Every report widget uses this frame: a title with its unit in brackets
 * (WAVV style), a one-line plain-English explanation, then the content.
 */
export function ReportCard({
  title,
  unit,
  description,
  aside,
  children,
  className = "",
}: {
  title: string;
  unit?: string;
  description: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-[10px] border border-[var(--ods-border)] bg-[var(--ods-bg-primary)] p-4 ${className}`}>
      <header className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold text-[var(--ods-text-primary)]">
            {title}
            {unit && <span className="font-normal text-[var(--ods-text-tertiary)]"> ({unit})</span>}
          </h3>
          <p className="text-[12px] text-[var(--ods-text-secondary)] mt-0.5">{description}</p>
        </div>
        {aside && <div className="shrink-0">{aside}</div>}
      </header>
      {children}
    </section>
  );
}

export interface Stat {
  label: string;
  value: string;
  /** Small line under the value, e.g. how it is calculated. */
  detail?: string;
  icon?: IconComponent;
  tone?: "default" | "positive" | "negative";
}

/** A row of headline numbers, each with what it means. */
export function StatTiles({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
      {stats.map(({ label, value, detail, icon: Icon, tone = "default" }) => (
        <div key={label} className="rounded-[10px] border border-[var(--ods-border)] bg-[var(--ods-bg-primary)] p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--ods-text-tertiary)]">
            {Icon && <Icon className="w-3.5 h-3.5" />}
            {label}
          </div>
          <div
            className={`mt-1.5 text-[22px] font-semibold tabular-nums ${
              tone === "positive" ? "text-emerald-600" : tone === "negative" ? "text-red-600" : "text-[var(--ods-text-primary)]"
            }`}
          >
            {value}
          </div>
          {detail && <div className="text-[11px] text-[var(--ods-text-secondary)] mt-0.5">{detail}</div>}
        </div>
      ))}
    </div>
  );
}

/**
 * Member x day table with row and column totals. With `goal`, a member's day
 * is green once it reaches the goal so progress is visible at a glance.
 */
export function PivotTable({
  columns,
  rows,
  goal,
  emptyText,
}: {
  columns: string[];
  rows: { member: string; counts: number[]; total: number }[];
  goal?: number;
  emptyText: string;
}) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-[13px] text-[var(--ods-text-secondary)]">{emptyText}</p>;
  }
  const colTotals = columns.map((_, i) => rows.reduce((sum, r) => sum + (r.counts[i] ?? 0), 0));
  const grand = colTotals.reduce((a, b) => a + b, 0);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px] tabular-nums">
        <thead>
          <tr className="text-[12px] text-[var(--ods-text-secondary)]">
            <th className="py-2 pr-3 text-left font-semibold">Team member</th>
            {columns.map((c) => (
              <th key={c} className="py-2 px-1 text-center font-semibold min-w-[48px]">
                {c}
              </th>
            ))}
            <th className="py-2 pl-3 text-center font-semibold border-l border-[var(--ods-border)]">Total</th>
          </tr>
        </thead>
        <tbody className="border-t border-[var(--ods-border)]">
          {rows.map((r) => (
            <tr key={r.member}>
              <td className="py-2 pr-3 text-[var(--ods-text-primary)] whitespace-nowrap">{r.member}</td>
              {r.counts.map((n, i) => (
                <td key={i} className="py-1.5 px-1 text-center">
                  <span
                    className={`inline-block min-w-[36px] px-1.5 py-1 rounded-[6px] ${
                      goal && n >= goal
                        ? "bg-emerald-500/15 text-emerald-700 font-semibold"
                        : n > 0
                          ? "bg-[var(--ods-bg-tertiary)] text-[var(--ods-text-primary)] font-medium"
                          : "bg-[var(--ods-bg-secondary)] text-[var(--ods-text-tertiary)]"
                    }`}
                  >
                    {n}
                  </span>
                </td>
              ))}
              <td className="py-2 pl-3 text-center font-semibold text-[var(--ods-text-primary)] border-l border-[var(--ods-border)]">
                {r.total}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-[var(--ods-border-strong)]">
          <tr className="font-semibold text-[var(--ods-text-primary)]">
            <td className="py-2 pr-3">Total</td>
            {colTotals.map((n, i) => (
              <td key={i} className="py-2 px-1 text-center">
                {n}
              </td>
            ))}
            <td className="py-2 pl-3 text-center border-l border-[var(--ods-border)]">{grand}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOUR_LABELS: Record<number, string> = { 0: "12am", 6: "6am", 12: "12pm", 18: "6pm", 23: "11pm" };

/** Weekday x hour heatmap; hover a cell for the exact count. */
export function Heatmap({ grid }: { grid: number[][] }) {
  const max = Math.max(1, ...grid.flat());
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[560px]">
        <div className="grid grid-cols-[48px_repeat(7,1fr)] gap-1 mb-1">
          <span />
          {DAYS.map((d) => (
            <span key={d} className="text-center text-[12px] font-medium text-[var(--ods-text-secondary)]">
              {d}
            </span>
          ))}
        </div>
        {Array.from({ length: 24 }, (_, hour) => (
          <div key={hour} className="grid grid-cols-[48px_repeat(7,1fr)] gap-1 mb-[2px]">
            <span className="text-[11px] leading-[10px] text-[var(--ods-text-tertiary)]">{HOUR_LABELS[hour] ?? ""}</span>
            {DAYS.map((d, day) => {
              const n = grid[day][hour];
              return (
                <span
                  key={d}
                  title={`${d} ${hour}:00 - ${n} call${n === 1 ? "" : "s"}`}
                  className="h-[10px] rounded-[2px]"
                  style={{
                    background: n === 0 ? "var(--ods-bg-tertiary)" : `rgba(37, 99, 235, ${0.25 + 0.75 * (n / max)})`,
                  }}
                />
              );
            })}
          </div>
        ))}
        <div className="flex items-center justify-center gap-3 mt-2 text-[11px] text-[var(--ods-text-secondary)]">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-[2px] bg-[var(--ods-bg-tertiary)]" /> None
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-[2px]" style={{ background: "rgba(37,99,235,0.35)" }} /> Few
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-[2px]" style={{ background: "rgba(37,99,235,1)" }} /> Most (max {max})
          </span>
        </div>
      </div>
    </div>
  );
}

/** WAVV-style two-line toolbar dropdown trigger: icon on the left, caption above the value. */
export function TwoLineTrigger({ icon: Icon, caption, value }: { icon: IconComponent; caption: string; value: string }) {
  return (
    <>
      <Icon className="w-4 h-4 shrink-0 text-[var(--ods-text-secondary)]" />
      <span className="flex flex-col items-start leading-tight min-w-0">
        <span className="text-[11px] text-[var(--ods-text-tertiary)]">{caption}</span>
        <span className="text-[13px] font-medium text-[var(--ods-text-primary)] truncate max-w-[180px]">{value}</span>
      </span>
      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 ml-auto opacity-60 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
        <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </>
  );
}

export const TWO_LINE_TRIGGER_CLASS =
  "h-11 min-w-[200px] px-3 inline-flex items-center gap-2.5 rounded-[8px] border border-[var(--ods-border-strong)] bg-[var(--ods-bg-primary)] hover:bg-[var(--ods-hover)] transition-colors text-left";
