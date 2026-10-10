import { Fragment, useMemo, useState } from "react";
import {
  Activity,
  CalendarDays,
  ChevronDown,
  FileText,
  Globe,
  ListFilter,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  type IconComponent,
} from "@/components/ui/icons";
import { Chip } from "@/components/ui/Chip";
import { SelectMenu } from "@/components/ui/Menu";
import { text, type Display, type HistoryRow } from "@/domains/activity";
import type { Contact } from "../types/contact";
import { useRecordHistory } from "../lib/use-record-history";

/* ------------------------------------------------------------ shared bits */

/** One value in a history sentence: a chip for options, a link, swatches, or plain bold text. */
export function HistoryValue({ value }: { value: Display }) {
  switch (value.kind) {
    case "blank":
      return <span className="italic text-[var(--ods-text-tertiary)]">blank</span>;
    case "option":
      return (
        <Chip dot={value.dot} className="align-middle">
          {value.text}
        </Chip>
      );
    case "link":
      return (
        <a href={value.href} target="_blank" rel="noreferrer" title={value.href} className="inline-block max-w-full truncate align-bottom font-semibold ods-link">
          {value.text}
        </a>
      );
    case "colors":
      return (
        <span className="inline-flex items-center gap-1 align-middle" title={value.colors.join(", ")}>
          {value.colors.slice(0, 6).map((c) => (
            <span key={c} className="w-4 h-4 rounded-md border border-[var(--ods-border)]" style={{ background: c }} />
          ))}
        </span>
      );
    case "long":
      return <span className="font-semibold">long text</span>;
    default:
      return <span className="font-semibold text-[var(--ods-text-primary)] break-words">{value.text}</span>;
  }
}

/** The row as a sentence: "Status changed from [New] to [Call back]". */
export function HistorySentence({ row }: { row: HistoryRow }) {
  const label = <span className="font-semibold text-[var(--ods-text-primary)]">{row.label}</span>;
  if (row.kind === "created" || row.kind === "deleted" || row.kind === "restored" || row.kind === "note") return label;
  // Long values (summaries, metadata) are shown as a block under the row.
  if (row.after.kind === "long" || row.before.kind === "long") {
    return (
      <>
        {label} {row.kind === "set" ? "added" : row.kind === "cleared" ? "cleared" : "updated"}
      </>
    );
  }
  if (row.kind === "set") {
    return (
      <>
        {label} set to <HistoryValue value={row.after} />
      </>
    );
  }
  if (row.kind === "cleared") {
    return (
      <>
        {label} cleared, was <HistoryValue value={row.before} />
      </>
    );
  }
  return (
    <>
      {label} changed from <HistoryValue value={row.before} /> to <HistoryValue value={row.after} />
    </>
  );
}

/** Long text (notes, summaries) below the sentence, clamped with "Show more". */
function LongText({ value, tone = "neutral" }: { value: string; tone?: "neutral" | "note" }) {
  const [open, setOpen] = useState(false);
  const long = value.length > 220 || value.split("\n").length > 4;
  return (
    <div
      className={`mt-1.5 rounded-[8px] px-3 py-2 text-[13px] whitespace-pre-wrap break-words ${
        tone === "note" ? "bg-amber-500/10 border border-amber-500/30" : "bg-[var(--ods-bg-secondary)] border border-[var(--ods-border)]"
      }`}
    >
      <div className={open || !long ? "" : "line-clamp-4"}>{value}</div>
      {long && (
        <button onClick={() => setOpen(!open)} className="mt-1 text-[12px] font-semibold ods-link">
          {open ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

export function rowIcon(row: HistoryRow): IconComponent {
  if (row.kind === "created") return Plus;
  if (row.kind === "deleted") return Trash2;
  if (row.kind === "restored") return RotateCcw;
  if (row.kind === "note") return FileText;
  const f = row.field ?? "";
  if (/status|state|label|qualification/i.test(f)) return Activity;
  if (/phone/i.test(f)) return Phone;
  if (/email/i.test(f)) return Mail;
  if (/address|city|region|zip|country/i.test(f)) return MapPin;
  if (/url|website|link/i.test(f)) return Globe;
  return Pencil;
}

const ICON_TONE: Partial<Record<HistoryRow["kind"], string>> = {
  created: "text-emerald-600",
  deleted: "text-red-600",
  note: "text-amber-600",
};

/* ------------------------------------------------------------ the panel */

type Filter = "all" | "status" | "contact" | "notes" | "record";

const FILTERS: { value: Filter; label: string; match: (r: HistoryRow) => boolean }[] = [
  { value: "all", label: "All changes", match: () => true },
  { value: "status", label: "Status and pipeline", match: (r) => /status|state|label|qualification|campaign/i.test(r.field ?? "") },
  { value: "contact", label: "Contact details", match: (r) => /name|phone|email|website|address|city|region|zip|country/i.test(r.field ?? "") },
  { value: "notes", label: "Notes", match: (r) => r.kind === "note" || /^notes?$/.test(r.field ?? "") },
  { value: "record", label: "Created and deleted", match: (r) => r.kind === "created" || r.kind === "deleted" || r.kind === "restored" },
];

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === new Date(today.getTime() - 86_400_000).toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { day: "numeric", month: "short", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

/**
 * Who changed what on this record, newest first: one row per field change
 * with the time on the left, an icon on the timeline line, the change as a
 * sentence and "who · how" underneath (Zoho Timeline / HubSpot property
 * history). Searchable and filterable by kind of field.
 */
export function RecordHistory({ contact }: { contact: Contact }) {
  const { rows, isLoading, error } = useRecordHistory(contact);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = FILTERS.find((f) => f.value === filter)!.match;
    return rows.filter((r) => {
      if (!match(r)) return false;
      if (!q) return true;
      return [r.label, text(r.before), text(r.after), r.note ?? "", r.who].some((s) => s.toLowerCase().includes(q));
    });
  }, [rows, query, filter]);

  let lastDay = "";
  return (
    <div className="flex flex-col min-h-0">
      <div className="p-3 flex items-center gap-2 border-b border-[var(--ods-border)]">
        <div className="flex-1 min-w-0 flex items-center gap-2 h-9 px-2.5 rounded-[8px] border border-[var(--ods-border)] bg-[var(--ods-bg-primary)] focus-within:border-[var(--ods-brand-500)]">
          <Search className="w-3.5 h-3.5 shrink-0 text-[var(--ods-text-tertiary)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search changes"
            className="flex-1 min-w-0 bg-transparent text-[14px] outline-none placeholder:text-[var(--ods-text-tertiary)]"
          />
        </div>
        <SelectMenu
          value={filter}
          onChange={(v) => setFilter(v as Filter)}
          width={220}
          placement="bottom-end"
          sections={[{ title: "Show", options: FILTERS.map((f) => ({ value: f.value, label: f.label, hint: rows.filter(f.match).length })) }]}
          triggerTitle="Filter changes"
          triggerClassName={`h-9 px-2.5 shrink-0 rounded-[8px] border text-[13px] font-semibold inline-flex items-center gap-1.5 ${
            filter === "all" ? "border-[var(--ods-border-strong)] hover:bg-[var(--ods-hover)]" : "border-[var(--ods-brand-600)] bg-[var(--ods-brand-600)]/10"
          }`}
          trigger={
            <>
              <ListFilter className="w-3.5 h-3.5" />
              <ChevronDown className="w-3 h-3 opacity-60" />
            </>
          }
        />
      </div>

      {isLoading ? (
        <HistorySkeleton />
      ) : error ? (
        <p className="p-6 text-center text-[13px] text-red-600">History could not be loaded: {error.message}</p>
      ) : shown.length === 0 ? (
        <p className="p-6 text-center text-[13px] text-[var(--ods-text-tertiary)]">
          {rows.length === 0 ? "Twenty has no recorded changes for this contact." : "No changes match."}
        </p>
      ) : (
        <ol className="px-3 py-3">
          {shown.map((row, i) => {
            const day = dayLabel(row.at);
            const separator = day !== lastDay;
            lastDay = day;
            const Icon = rowIcon(row);
            const last = i === shown.length - 1 || dayLabel(shown[i + 1].at) !== day;
            return (
              <Fragment key={row.id}>
                {separator && (
                  <li className={`flex justify-center ${i > 0 ? "mt-3" : ""} mb-3`}>
                    <Chip icon={CalendarDays}>{day}</Chip>
                  </li>
                )}
                <li className="grid grid-cols-[52px_24px_minmax(0,1fr)] gap-x-2.5">
                  <time dateTime={row.at} className="h-6 flex items-center justify-end text-[12px] tabular-nums whitespace-nowrap text-[var(--ods-text-tertiary)]">
                    {new Date(row.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  </time>
                  <div className="relative flex justify-center">
                    {!last && <span className="absolute top-6 bottom-0 w-px bg-[var(--ods-border)]" aria-hidden="true" />}
                    <span className="relative w-6 h-6 rounded-md border border-[var(--ods-border)] bg-[var(--ods-bg-primary)] flex items-center justify-center">
                      <Icon className={`w-3 h-3 ${ICON_TONE[row.kind] ?? "text-[var(--ods-text-secondary)]"}`} />
                    </span>
                  </div>
                  <div className={`min-w-0 ${last ? "" : "pb-4"}`}>
                    <div className="text-[13px] leading-6 text-[var(--ods-text-secondary)]">
                      <HistorySentence row={row} />
                    </div>
                    {row.note && <LongText value={row.note} tone="note" />}
                    {row.after.kind === "long" && <LongText value={row.after.text} />}
                    <div className="mt-0.5 text-[12px] leading-4 text-[var(--ods-text-tertiary)]">
                      {row.who}
                      {row.source ? ` · ${row.source}` : ""}
                    </div>
                  </div>
                </li>
              </Fragment>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function HistorySkeleton() {
  return (
    <div className="px-3 py-3 space-y-4" role="status" aria-label="Loading">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="grid grid-cols-[52px_24px_minmax(0,1fr)] gap-x-2.5">
          <div className="h-3 w-10 ml-auto mt-1.5 rounded-md bg-[var(--ods-bg-tertiary)] animate-pulse" />
          <div className="w-6 h-6 rounded-md bg-[var(--ods-bg-tertiary)] animate-pulse" />
          <div className="space-y-1.5 pt-1">
            <div className={`h-3.5 rounded-md bg-[var(--ods-bg-tertiary)] animate-pulse ${["w-4/5", "w-3/5", "w-2/3"][i % 3]}`} />
            <div className="h-3 w-1/3 rounded-md bg-[var(--ods-bg-tertiary)] animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}
