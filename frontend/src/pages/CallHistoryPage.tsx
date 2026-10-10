import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AudioLines } from "@/components/ui/icons";
import { useCalls } from "@/hooks/use-call-logs";
import { RatingBadge, CallQualityScores, WaveformPlayer, parseAiScores } from "@/components/calls/CallRating";
import { api } from "@/lib/api-client";
import { DataTable, useDataTable, type DataColumn } from "@/components/table";
import { StatusFilterDropdown } from "@/components/common/StatusFilterDropdown";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { callStatusLabel, dispositionTypeOfStatus } from "@/lib/call-outcome";

const RESULT_OPTIONS = [
  { value: "positive", label: "Positive", dotColor: "bg-emerald-500", bgTint: "", textColor: "" },
  { value: "negative", label: "Negative", dotColor: "bg-red-500", bgTint: "", textColor: "" },
];

type Call = NonNullable<ReturnType<typeof useCalls>["data"]>[number];

export function CallHistoryPage() {
  const navigate = useNavigate();
  const { data: calls, isLoading } = useCalls();
  const [expandedAudioId, setExpandedAudioId] = useState<string | null>(null);
  const table = useDataTable("call-history");
  const [resultFilter, setResultFilter] = usePersistedState<string>("call-history-filter-result", "all");

  const { data: leads } = useQuery({
    queryKey: ["leads"],
    queryFn: async () => api.leads.list(),
    staleTime: Infinity,
  });
  const { data: prospects } = useQuery({
    queryKey: ["prospects"],
    queryFn: async () => api.prospects.list(),
    staleTime: Infinity,
  });

  const recordNameOf = (call: Call) => {
    if (call.agencyLeadId) {
      const lead: any = (leads ?? []).find((l: any) => l.id === call.agencyLeadId);
      if (lead) return `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim() || lead.phone || call.toNumber || "—";
    }
    if (call.agencyProspectId) {
      const prospect: any = (prospects ?? []).find((p: any) => p.id === call.agencyProspectId);
      if (prospect) return `${prospect.first_name ?? ""} ${prospect.last_name ?? ""}`.trim() || prospect.phone || call.toNumber || "—";
    }
    return call.toNumber || "—";
  };

  const hasAudio = (call: Call) => !!(call.telnyxRecordingId || call.recordingUrl);

  const columns: DataColumn<Call>[] = [
    { key: "agent", label: "Agent", type: "text", width: 160, value: (c) => c.createdBy?.name || "Unknown", filterable: true },
    { key: "contact", label: "Contact", type: "title", width: 200, value: recordNameOf },
    {
      key: "status",
      label: "Disposition",
      type: "status",
      width: 150,
      value: (c) => c.status ?? "unknown",
      text: (c) => callStatusLabel(c.status ?? "unknown"),
      filterable: true,
    },
    { key: "duration", label: "Duration", type: "duration", value: (c) => c.durationSeconds },
    {
      key: "recording",
      label: "Recording",
      type: "custom",
      width: 110,
      sortable: false,
      value: (c) => (hasAudio(c) ? "yes" : null),
      render: (c) => {
        if (!hasAudio(c)) return <span className="text-[var(--ods-text-tertiary)]">—</span>;
        const open = expandedAudioId === c.id;
        return (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpandedAudioId(open ? null : c.id);
            }}
            className="inline-flex items-center gap-1 text-[12px] text-[var(--ods-brand-600)] hover:underline"
          >
            <AudioLines className="w-3.5 h-3.5" />
            {open ? "Hide" : "Play"}
          </button>
        );
      },
    },
    { key: "summary", label: "Summary", type: "text", width: 300, value: (c) => c.aiSummary ?? c.summary },
    {
      key: "rating",
      label: "Rating",
      type: "custom",
      width: 120,
      value: (c) => c.aiScore,
      text: (c) => c.aiSentiment ?? null,
      render: (c) => <RatingBadge sentiment={c.aiSentiment} score={c.aiScore} />,
    },
    { key: "date", label: "Date", type: "datetime", value: (c) => c.created_at },
  ];

  return (
    <DataTable
      state={table}
      title="Call History"
      columns={columns}
      rows={calls}
      loading={isLoading}
      getRowId={(c) => c.id}
      searchText={(c) => `${c.toNumber ?? ""} ${c.fromNumber ?? ""} ${c.summary ?? ""}`}
      defaultSort={{ key: "date", direction: "desc" }}
      filter={(c) => resultFilter === "all" || dispositionTypeOfStatus(c.status) === resultFilter}
      onClearFilters={() => setResultFilter("all")}
      filters={
        <StatusFilterDropdown
          label="Result"
          allLabel="All results"
          value={resultFilter}
          options={RESULT_OPTIONS}
          onChange={setResultFilter}
        />
      }
      onRowClick={(c) => navigate(`/history/${c.id}`)}
      emptyMessage="No call records found"
      renderExpanded={(call) =>
        expandedAudioId === call.id ? (
          <div className="flex flex-col lg:flex-row gap-3 items-stretch whitespace-normal">
            <div className="flex-1 min-w-0">
              {hasAudio(call) ? (
                <WaveformPlayer
                  src={call.telnyxRecordingId ? `/api/calls/${call.id}/audio` : call.recordingUrl!}
                  seed={call.id}
                  detailHref={`/history/${call.id}`}
                />
              ) : (
                <p className="text-[12px] text-[var(--ods-text-secondary)]">No recording yet.</p>
              )}
              {call.transcript && (
                <p className="mt-2 text-[12px] text-[var(--ods-text-secondary)] whitespace-pre-wrap max-h-32 overflow-y-auto">
                  {call.transcript}
                </p>
              )}
            </div>
            <div className="lg:w-80 shrink-0">
              <CallQualityScores scores={parseAiScores(call.aiScores)} />
            </div>
          </div>
        ) : null
      }
    />
  );
}
