import type { ReactNode } from "react";
import { useEvenColumns } from "@/hooks/use-even-columns";
import { ChevronDown, type IconComponent } from "@/components/ui/icons";
import { InfoTip, type TipSpec } from "@/components/ui/InfoTip";
import { SectionTitle } from "@/components/ui/SectionTitle";

/**
 * Every report widget uses this frame: a text-xl title with its unit in a
 * pill, the plain-English explanation behind the eye tooltip, then content.
 */
export function ReportCard({
  title,
  unit,
  tip,
  aside,
  children,
  className = "",
}: {
  title: string;
  unit?: string;
  tip: TipSpec;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-[10px] border border-[var(--ods-border)] bg-[var(--ods-bg-primary)] p-4 ${className}`}>
      <header className="flex items-center justify-between gap-3 mb-4">
        <SectionTitle title={title} pill={unit} info={tip} />
        {aside && <div className="shrink-0">{aside}</div>}
      </header>
      {children}
    </section>
  );
}

/** Table styling shared with the Prospects / Leads DataTable: bordered cells, tinted header, 36px rows. */
export const TH = "h-9 px-3 whitespace-nowrap text-left text-[13px] font-medium text-[var(--ods-text-primary)] border border-[var(--ods-border)] bg-[var(--ods-bg-secondary)]";
export const TD = "h-9 px-3 whitespace-nowrap text-[13px] text-[var(--ods-text-primary)] border border-[var(--ods-border)]";
export const TR = "transition-colors hover:bg-[var(--ods-bg-secondary)]";

/** Header cell with an optional eye tooltip explaining the column. */
export function HeadCell({ children, tip, className = "" }: { children: ReactNode; tip?: TipSpec; className?: string }) {
  return (
    <th className={`${TH} ${className}`}>
      <span className="inline-flex items-center gap-1">
        {children}
        {tip && <InfoTip tip={tip} className="w-5 h-5" />}
      </span>
    </th>
  );
}

export function ReportTable({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto no-scrollbar rounded-[6px]">
      <table className="w-full border-collapse text-left tabular-nums">{children}</table>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-[14px] text-[var(--ods-text-secondary)]">{children}</p>;
}

export interface Stat {
  label: string;
  value: string;
  /** How the number is calculated; shown in the eye tooltip. */
  tip?: TipSpec;
  icon?: IconComponent;
  tone?: "default" | "positive" | "negative" | "warning";
}

const TONE: Record<NonNullable<Stat["tone"]>, { chip: string; value: string }> = {
  default: { chip: "bg-blue-500/15 text-blue-600", value: "text-[var(--ods-text-primary)]" },
  positive: { chip: "bg-emerald-500/15 text-emerald-600", value: "text-emerald-600" },
  negative: { chip: "bg-red-500/15 text-red-600", value: "text-red-600" },
  warning: { chip: "bg-amber-500/15 text-amber-600", value: "text-amber-600" },
};

/** A row of headline numbers: big value, icon chip, explanation behind the eye. */
export function StatTiles({ stats }: { stats: Stat[] }) {
  // Whole rows only (6 tiles: 6 x 1, 3 x 2 or 2 x 3), sized from the space the tiles get.
  const grid = useEvenColumns(stats.length);
  return (
    <div ref={grid.ref} style={grid.style} className="grid gap-3">
      {stats.map(({ label, value, tip, icon: Icon, tone = "default" }) => (
        <div key={label} className="rounded-[10px] border border-[var(--ods-border)] bg-[var(--ods-bg-primary)] p-4 min-h-[112px] flex flex-col">
          <div className="flex items-center gap-2.5">
            {Icon && (
              <span className={`w-9 h-9 shrink-0 rounded-[8px] flex items-center justify-center ${TONE[tone].chip}`}>
                <Icon className="w-4 h-4" />
              </span>
            )}
            <span className="flex-1 min-w-0 text-[14px] font-semibold text-[var(--ods-text-secondary)] truncate">{label}</span>
            {tip && <InfoTip tip={{ icon: Icon, ...tip }} />}
          </div>
          {/* Words (a name, an object) get a smaller size than numbers so they fit on one line. */}
          <div
            title={value}
            className={`mt-auto pt-3 leading-none font-bold tabular-nums truncate ${/^[\d.,%:hms —-]+$/.test(value) ? "text-[30px]" : "text-[22px]"} ${TONE[tone].value}`}
          >
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Bold coloured figures under a chart (replaces the old sentence of small text). */
export function ChartSummary({ items }: { items: { label: string; value: string; color: string }[] }) {
  return (
    <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
      {items.map((i) => (
        <div key={i.label} className="flex items-center gap-2.5 rounded-[8px] border border-[var(--ods-border)] px-3 py-2">
          <span className="w-1.5 self-stretch rounded-full" style={{ background: i.color }} />
          <div className="min-w-0">
            <div className="text-[18px] font-bold leading-tight tabular-nums text-[var(--ods-text-primary)]">{i.value}</div>
            <div className="text-[12px] font-medium text-[var(--ods-text-secondary)] truncate">{i.label}</div>
          </div>
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
  if (rows.length === 0) return <EmptyState>{emptyText}</EmptyState>;
  const colTotals = columns.map((_, i) => rows.reduce((sum, r) => sum + (r.counts[i] ?? 0), 0));
  const grand = colTotals.reduce((a, b) => a + b, 0);
  return (
    <ReportTable>
      <thead>
        <tr>
          <th className={TH}>Team member</th>
          {columns.map((c) => (
            <th key={c} className={`${TH} text-center min-w-[56px]`}>
              {c}
            </th>
          ))}
          <th className={`${TH} text-center`}>Total</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.member} className={TR}>
            <td className={`${TD} font-medium`}>{r.member}</td>
            {r.counts.map((n, i) => (
              <td
                key={i}
                className={`${TD} text-center ${
                  goal && n >= goal
                    ? "bg-emerald-500/15 text-emerald-700 font-bold"
                    : n > 0
                      ? "font-semibold"
                      : "text-[var(--ods-text-tertiary)]"
                }`}
              >
                {n}
              </td>
            ))}
            <td className={`${TD} text-center font-bold`}>{r.total}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="bg-[var(--ods-bg-secondary)] font-bold">
          <td className={TD}>Total</td>
          {colTotals.map((n, i) => (
            <td key={i} className={`${TD} text-center`}>
              {n}
            </td>
          ))}
          <td className={`${TD} text-center`}>{grand}</td>
        </tr>
      </tfoot>
    </ReportTable>
  );
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOUR_LABELS: Record<number, string> = { 0: "12am", 6: "6am", 12: "12pm", 18: "6pm", 23: "11pm" };

/** Weekday x hour heatmap; hover a cell for the exact count. */
export function Heatmap({ grid }: { grid: number[][] }) {
  const max = Math.max(1, ...grid.flat());
  return (
    <div className="overflow-x-auto no-scrollbar">
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
      <ChevronDown className="w-3 h-3 ml-auto opacity-60 shrink-0" />
    </>
  );
}

export const TWO_LINE_TRIGGER_CLASS =
  "h-11 min-w-[200px] px-3 inline-flex items-center gap-2.5 rounded-[8px] border border-[var(--ods-border-strong)] bg-[var(--ods-bg-primary)] hover:bg-[var(--ods-hover)] transition-colors text-left";
