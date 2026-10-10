import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LINK } from "@/domains/ui/tokens";
import {
  AudioLines,
  CalendarDays,
  Clock as History,
  PhoneIncoming,
  PhoneOutgoing,
  ThumbsDown,
  ThumbsUp,
  Timer,
  User,
  XCircle,
} from "@/domains/ui/icons";
import { useCalls, type AgencyCallRecord } from "@/domains/calls/data";
import { RatingBadge } from "@/domains/calls/rating";
import { DispositionBadge, DispositionIcon, dispositionMeta } from "@/domains/calls/disposition";
import { CallQuickView } from "@/domains/calls/insight";
import { contactName, useProspectLookup } from "@/domains/contact/list";
import { DataTable, useDataTable, type DataColumn } from "@/domains/ui/table";
import { StatusFilterDropdown } from "@/domains/ui/status";
import type { StatusOption } from "@/domains/ui/status";
import { usePersistedState } from "@/domains/app/persistedState";
import { useReportSettings } from "@/domains/reports/data";
import { dispositionTypeOfStatus } from "@/domains/calls/disposition";
import { RANGE_LABELS, rangeFor, type RangePreset } from "@/domains/reports/data";

type Call = AgencyCallRecord;

const ALL = "all";
const ICON = "w-4 h-4 shrink-0";

/** StatusFilterDropdown option with an icon and a count instead of a dot. */
function option(value: string, label: string, icon: React.ReactNode, count?: number): StatusOption {
  return { value, label, icon, hint: count, dotColor: "", bgTint: "", textColor: "" };
}

function countBy<T>(rows: T[], key: (row: T) => string): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) out.set(key(r), (out.get(key(r)) ?? 0) + 1);
  return out;
}

const hasAudio = (call: Call) => !!(call.telnyxRecordingId || call.recordingUrl);
const isInbound = (call: Call) => String(call.direction ?? "").toUpperCase() === "INBOUND";
const agentOf = (call: Call) => call.createdBy?.name || "Unknown";
const statusOf = (call: Call) => String(call.status ?? "UNKNOWN").toUpperCase();

/* Header-filter buckets for columns whose raw values are all different. */
const DURATION_BUCKETS = ["Under 10s", "10-59s", "1-5 min", "Over 5 min"];
function durationBucket(c: Call): string {
  const s = c.durationSeconds ?? 0;
  return s < 10 ? DURATION_BUCKETS[0] : s < 60 ? DURATION_BUCKETS[1] : s <= 300 ? DURATION_BUCKETS[2] : DURATION_BUCKETS[3];
}
const DATE_BUCKETS = ["Today", "Yesterday", "Earlier this week", "Older"];
function dateBucket(c: Call): string {
  const t = new Date(c.startedAt ?? c.created_at);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.floor((today.getTime() - new Date(t).setHours(0, 0, 0, 0)) / 86_400_000);
  return days <= 0 ? DATE_BUCKETS[0] : days === 1 ? DATE_BUCKETS[1] : days < 7 ? DATE_BUCKETS[2] : DATE_BUCKETS[3];
}
const RATING_ORDER = ["Positive", "Neutral", "Negative", "Not rated"];
function ratingBucket(c: Call): string {
  if (c.aiScore == null) return "Not rated";
  const s = String(c.aiSentiment || "NEUTRAL").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function CallHistoryPage() {
  const navigate = useNavigate();
  const { data: calls, isLoading } = useCalls();
  const { conversationSeconds } = useReportSettings();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const table = useDataTable("call-history");

  // Toolbar filters, same pattern as Contacts. Each remembers its choice.
  const [result, setResult] = usePersistedState<string>("call-history-filter-result", ALL);
  const [disposition, setDisposition] = usePersistedState<string>("call-history-filter-disposition", ALL);
  const [agent, setAgent] = usePersistedState<string>("call-history-filter-agent", ALL);
  const [direction, setDirection] = usePersistedState<string>("call-history-filter-direction", ALL);
  const [date, setDate] = usePersistedState<string>("call-history-filter-date", ALL);
  const [recording, setRecording] = usePersistedState<string>("call-history-filter-recording", ALL);

  // Names for just the contacts these calls reference, looked up by id.
  const { data: lookedUp } = useProspectLookup((calls ?? []).flatMap((c) => [c.agencyProspectId, c.agencyLeadId]));
  const contactNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const [id, r] of lookedUp ?? []) {
      const name = contactName(r);
      if (name) map.set(id, name);
    }
    return map;
  }, [lookedUp]);
  const contactOf = (c: Call) => contactNames.get(c.agencyLeadId ?? "") || contactNames.get(c.agencyProspectId ?? "") || c.toNumber || "—";

  const all = calls ?? [];

  const resultOptions = useMemo(() => {
    const counts = countBy(all, (c) => dispositionTypeOfStatus(c.status) ?? "other");
    return [
      option("positive", "Positive", <ThumbsUp className={`${ICON} text-emerald-600`} />, counts.get("positive") ?? 0),
      option("negative", "Negative", <ThumbsDown className={`${ICON} text-red-600`} />, counts.get("negative") ?? 0),
    ];
  }, [all]);

  const dispositionOptions = useMemo(
    () =>
      [...countBy(all, statusOf).entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([status, n]) => option(status, dispositionMeta(status).label, <DispositionIcon status={status} className="w-4 h-4" />, n)),
    [all],
  );

  const agentOptions = useMemo(
    () =>
      [...countBy(all, agentOf).entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([name, n]) => option(name, name, <User className={`${ICON} text-[var(--ods-text-secondary)]`} />, n)),
    [all],
  );

  const directionOptions = useMemo(() => {
    const inbound = all.filter(isInbound).length;
    return [
      option("outbound", "Outbound", <PhoneOutgoing className={`${ICON} text-[var(--ods-brand-600)]`} />, all.length - inbound),
      option("inbound", "Inbound", <PhoneIncoming className={`${ICON} text-[var(--ods-brand-600)]`} />, inbound),
    ];
  }, [all]);

  const dateOptions = (Object.keys(RANGE_LABELS) as RangePreset[]).map((k) =>
    option(k, RANGE_LABELS[k], <CalendarDays className={`${ICON} text-[var(--ods-text-secondary)]`} />),
  );

  const recordingOptions = useMemo(() => {
    const withAudio = all.filter(hasAudio).length;
    return [
      option("yes", "Has recording", <AudioLines className={`${ICON} text-emerald-600`} />, withAudio),
      option("no", "No recording", <XCircle className={`${ICON} text-[var(--ods-text-tertiary)]`} />, all.length - withAudio),
    ];
  }, [all]);

  // A remembered choice that no longer exists (e.g. an agent with no calls) means "all".
  const pick = (value: string, options: StatusOption[]) => (options.some((o) => o.value === value) ? value : ALL);
  const active = {
    result: pick(result, resultOptions),
    disposition: pick(disposition, dispositionOptions),
    agent: pick(agent, agentOptions),
    direction: pick(direction, directionOptions),
    date: pick(date, dateOptions),
    recording: pick(recording, recordingOptions),
  };
  const dateRange = active.date === ALL ? null : rangeFor(active.date as RangePreset);

  const passes = (c: Call) => {
    if (active.result !== ALL && dispositionTypeOfStatus(c.status) !== active.result) return false;
    if (active.disposition !== ALL && statusOf(c) !== active.disposition) return false;
    if (active.agent !== ALL && agentOf(c) !== active.agent) return false;
    if (active.direction !== ALL && (active.direction === "inbound") !== isInbound(c)) return false;
    if (active.recording !== ALL && (active.recording === "yes") !== hasAudio(c)) return false;
    if (dateRange) {
      const t = new Date(c.startedAt ?? c.created_at).getTime();
      if (t < dateRange.start.getTime() || t >= dateRange.end.getTime()) return false;
    }
    return true;
  };

  const clearFilters = () => {
    setResult(ALL);
    setDisposition(ALL);
    setAgent(ALL);
    setDirection(ALL);
    setDate(ALL);
    setRecording(ALL);
  };

  const labelToStatus = useMemo(() => new Map(all.map((c) => [dispositionMeta(c.status).label, c.status])), [all]);

  const columns: DataColumn<Call>[] = [
    { key: "agent", label: "Agent", type: "text", width: 160, value: agentOf, filterable: true },
    {
      key: "contact",
      label: "Contact",
      type: "title",
      width: 200,
      value: contactOf,
      filterable: true,
      // The name opens the prospect or lead; the rest of the row opens the call.
      render: (c) => {
        const name = contactOf(c);
        const path = c.agencyProspectId ? `/contacts/${c.agencyProspectId}` : c.agencyLeadId ? `/leads/${c.agencyLeadId}` : null;
        if (!path) return <span className="truncate">{name}</span>;
        return (
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate(path);
            }}
            title={`Open ${name}`}
            className={`${LINK} max-w-full truncate text-left font-semibold`}
          >
            {name}
          </button>
        );
      },
    },
    {
      key: "status",
      label: "Disposition",
      type: "custom",
      width: 170,
      value: (c) => c.status ?? "unknown",
      text: (c) => dispositionMeta(c.status).label,
      render: (c) => <DispositionBadge status={c.status} />,
      filterable: true,
      filterIcon: (label) => <DispositionIcon status={labelToStatus.get(label)} className="w-4 h-4" />,
    },
    {
      key: "duration",
      label: "Duration",
      type: "duration",
      value: (c) => c.durationSeconds,
      filterable: true,
      filterValue: durationBucket,
      filterOrder: DURATION_BUCKETS,
      filterIcon: () => <Timer className="w-4 h-4 text-[var(--ods-text-secondary)]" />,
    },
    {
      key: "recording",
      label: "Recording",
      type: "custom",
      width: 120,
      value: (c) => (hasAudio(c) ? "yes" : null),
      text: (c) => (hasAudio(c) ? "Has recording" : "No recording"),
      filterable: true,
      filterOrder: ["Has recording", "No recording"],
      filterIcon: (v) =>
        v === "Has recording" ? (
          <AudioLines className="w-4 h-4 text-emerald-600" />
        ) : (
          <XCircle className="w-4 h-4 text-[var(--ods-text-tertiary)]" />
        ),
      render: (c) => {
        if (!hasAudio(c)) return <span className="text-[var(--ods-text-tertiary)]">—</span>;
        const open = expandedId === c.id;
        return (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpandedId(open ? null : c.id);
            }}
            aria-expanded={open}
            className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-[12px] font-semibold transition-colors ${
              open
                ? "border-[var(--ods-brand-600)] bg-[var(--ods-brand-600)] text-white"
                : "border-[var(--ods-border-strong)] text-[var(--ods-brand-600)] hover:bg-[var(--ods-hover)]"
            }`}
          >
            <AudioLines className="w-3.5 h-3.5" />
            {open ? "Hide" : "Play"}
          </button>
        );
      },
    },
    {
      key: "summary",
      label: "Summary",
      type: "text",
      width: 300,
      value: (c) => c.aiSummary ?? c.summary,
      filterable: true,
      filterValue: (c) => (c.aiSummary || c.summary ? "Has summary" : "No summary"),
      filterOrder: ["Has summary", "No summary"],
    },
    {
      key: "rating",
      label: "Rating",
      type: "custom",
      width: 120,
      value: (c) => c.aiScore,
      text: (c) => c.aiSentiment ?? null,
      render: (c) => <RatingBadge sentiment={c.aiSentiment} score={c.aiScore} />,
      filterable: true,
      filterValue: ratingBucket,
      filterOrder: RATING_ORDER,
    },
    {
      key: "date",
      label: "Date",
      type: "datetime",
      value: (c) => c.startedAt ?? c.created_at,
      filterable: true,
      filterValue: dateBucket,
      filterOrder: DATE_BUCKETS,
      filterIcon: () => <CalendarDays className="w-4 h-4 text-[var(--ods-text-secondary)]" />,
    },
  ];

  return (
    <DataTable
      state={table}
      title="Call History"
      info={{
        title: "Call History",
        icon: History,
        what: "Every call made or received, newest first, with its outcome and recording.",
        key: [
          { color: "#22c55e", label: "Green icon", note: "positive disposition" },
          { color: "#ef4444", label: "Red icon", note: "negative disposition" },
          { color: "#9ca3af", label: "Gray icon", note: "system status" },
        ],
        use: "Filter with the buttons above the table. Play opens a quick view; click a row for the full review.",
      }}
      columns={columns}
      rows={calls}
      loading={isLoading}
      getRowId={(c) => c.id}
      searchText={(c) => `${contactOf(c)} ${agentOf(c)} ${c.toNumber ?? ""} ${c.fromNumber ?? ""} ${c.summary ?? ""} ${c.aiSummary ?? ""}`}
      defaultSort={{ key: "date", direction: "desc" }}
      filter={passes}
      onClearFilters={clearFilters}
      filters={
        <>
          <StatusFilterDropdown label="Result" allLabel="All results" value={active.result} options={resultOptions} onChange={setResult} />
          <StatusFilterDropdown label="Disposition" allLabel="All dispositions" value={active.disposition} options={dispositionOptions} onChange={setDisposition} />
          <StatusFilterDropdown label="Agent" allLabel="All agents" value={active.agent} options={agentOptions} onChange={setAgent} />
          <StatusFilterDropdown label="Direction" allLabel="Both directions" value={active.direction} options={directionOptions} onChange={setDirection} />
          <StatusFilterDropdown label="Date" allLabel="Any time" value={active.date} options={dateOptions} onChange={setDate} />
          <StatusFilterDropdown label="Recording" allLabel="All calls" value={active.recording} options={recordingOptions} onChange={setRecording} />
        </>
      }
      onRowClick={(c) => navigate(`/history/${c.id}`)}
      emptyMessage="No call records found"
      renderExpanded={(call) => (expandedId === call.id ? <CallQuickView call={call} conversationSeconds={conversationSeconds} /> : null)}
    />
  );
}
