import type { ReactNode } from "react";
import { StatusBadge } from "@/components/common/StatusBadge";

/**
 * Every table column has one of these types. The type decides how a value is
 * displayed, sorted, searched and offered as a filter option, so the same
 * kind of data looks and behaves the same in every table.
 */
export type ColumnType =
  | "title" // the record's name: emphasised, usually opens the record
  | "text"
  | "phone"
  | "email"
  | "number"
  | "duration" // seconds
  | "date"
  | "datetime"
  | "status" // a status value shown as a coloured badge
  | "badge" // a short category label shown as a chip
  | "custom"; // rendered by the column's own `render`

export type BadgeTone = "neutral" | "blue" | "green" | "red" | "amber" | "purple" | "rose" | "cyan" | "slate";

export const DEFAULT_COLUMN_WIDTH: Record<ColumnType, number> = {
  title: 220,
  text: 160,
  phone: 160,
  email: 200,
  number: 100,
  duration: 100,
  date: 120,
  datetime: 180,
  status: 150,
  badge: 140,
  custom: 150,
};

/** Text styles per type; every cell is 13px on one line. */
export const CELL_TYPE_CLASS: Record<ColumnType, string> = {
  title: "font-medium text-[var(--ods-text-primary)]",
  text: "text-[var(--ods-text-secondary)]",
  phone: "font-mono tabular-nums text-[var(--ods-text-secondary)]",
  email: "text-[var(--ods-text-secondary)]",
  number: "tabular-nums text-[var(--ods-text-secondary)]",
  duration: "tabular-nums text-[var(--ods-text-secondary)]",
  date: "tabular-nums text-[var(--ods-text-secondary)]",
  datetime: "tabular-nums text-[var(--ods-text-secondary)]",
  status: "",
  badge: "",
  custom: "text-[var(--ods-text-secondary)]",
};

const TONE_CLASS: Record<BadgeTone, string> = {
  neutral: "bg-[var(--ods-bg-secondary)] text-[var(--ods-text-secondary)] border-[var(--ods-border)]",
  blue: "bg-blue-500/10 text-blue-700 border-blue-500/20",
  green: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  red: "bg-red-500/10 text-red-700 border-red-500/20",
  amber: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  purple: "bg-purple-500/10 text-purple-700 border-purple-500/20",
  rose: "bg-rose-500/10 text-rose-700 border-rose-500/20",
  cyan: "bg-cyan-500/10 text-cyan-700 border-cyan-500/20",
  slate: "bg-slate-500/10 text-slate-700 border-slate-500/20",
};

export function isBlank(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${String(s % 60).padStart(2, "0")}s` : `${s}s`;
}

function toDate(value: unknown): Date | null {
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The value as plain text: what search matches and what filter options list. */
export function textFor(type: ColumnType, value: unknown): string {
  if (isBlank(value)) return "";
  switch (type) {
    case "duration":
      return formatDuration(Number(value));
    case "date":
      return toDate(value)?.toLocaleDateString() ?? "";
    case "datetime":
      return toDate(value)?.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) ?? "";
    case "status":
      return String(value).toLowerCase().replace(/_/g, " ");
    default:
      return String(value);
  }
}

/** The value used for ordering: numbers and dates sort numerically. */
export function sortValueFor(type: ColumnType, value: unknown): string | number | null {
  if (isBlank(value)) return null;
  switch (type) {
    case "number":
    case "duration":
      return Number(value);
    case "date":
    case "datetime":
      return toDate(value)?.getTime() ?? null;
    default:
      return textFor(type, value);
  }
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: BadgeTone }) {
  return (
    <span
      className={`inline-flex max-w-full items-center px-1.5 py-0.5 rounded-[4px] border text-[11px] font-medium truncate ${TONE_CLASS[tone]}`}
    >
      {children}
    </span>
  );
}

export const EMPTY_CELL = <span className="text-[var(--ods-text-tertiary)]">—</span>;

/** Default rendering for a typed value. Blank values always show an em dash. */
export function renderTyped(type: ColumnType, value: unknown, tone?: BadgeTone): ReactNode {
  if (isBlank(value)) return EMPTY_CELL;
  switch (type) {
    case "status":
      return <StatusBadge status={String(value)} />;
    case "badge":
      return <Badge tone={tone}>{String(value)}</Badge>;
    default:
      return textFor(type, value);
  }
}
