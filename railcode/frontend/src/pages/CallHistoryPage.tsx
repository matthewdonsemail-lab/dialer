import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useCalls } from "@/hooks/useCallLogs";
import { Search, Phone, User, AudioLines } from "lucide-react";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Spokes } from "@/components/ui/Spinner";
import { api } from "@/lib/apiClient";

export function CallHistoryPage() {
  const navigate = useNavigate();
  const { data: calls, isLoading } = useCalls();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedAudioId, setExpandedAudioId] = useState<string | null>(null);

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

  const recordNameOf = (call: { agencyLeadId: string | null; agencyProspectId: string | null; toNumber: string | null }) => {
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

  const filtered = useMemo(() => {
    if (!calls) return [];
    return calls
      .filter((call) => {
        const matchesStatus = statusFilter === "all" || call.status === statusFilter;
        const q = searchQuery.toLowerCase();
        const matchesSearch = !q ||
          (call.toNumber ?? "").includes(q) ||
          (call.fromNumber ?? "").includes(q) ||
          (call.summary ?? "").toLowerCase().includes(q) ||
          recordNameOf(call).toLowerCase().includes(q);
        return matchesStatus && matchesSearch;
      })
      // Newest first — the backend returns insertion order, so sort explicitly.
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [calls, statusFilter, searchQuery, leads, prospects]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spokes className="h-8 w-8 text-[var(--ods-brand-600)]" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full select-none bg-[var(--ods-bg-primary)]">
      {/* Twenty-style Action Bar */}
      <div className="h-10 px-3 flex items-center justify-between border-b border-[var(--ods-border)] shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-[var(--ods-text-primary)]">Call History</span>
          <span className="text-[11px] font-medium text-[var(--ods-text-secondary)] px-1.5 py-0.5 rounded-[4px] bg-[var(--ods-bg-secondary)] border border-[var(--ods-border)]">
            {filtered.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--ods-text-tertiary)]" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-7 pr-3 py-1.5 text-[12px] border border-[var(--ods-border)] rounded-[4px] bg-[var(--ods-bg-primary)] text-[var(--ods-text-primary)] placeholder:text-[var(--ods-text-tertiary)] outline-none focus:border-[var(--ods-brand-500)]"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 text-[12px] border border-[var(--ods-border)] rounded-[4px] bg-[var(--ods-bg-primary)] text-[var(--ods-text-primary)] outline-none focus:border-[var(--ods-brand-500)] appearance-none cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="COMPLETED">Completed</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="NO_ANSWER">No Answer</option>
            <option value="BUSY">Busy</option>
            <option value="FAILED">Failed</option>
          </select>
        </div>
      </div>

      {/* Flush Full-Bleed Table */}
      <div className="flex-1 w-full overflow-auto">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 bg-[var(--ods-bg-secondary)] z-10">
            <tr className="h-8 border-b border-[var(--ods-border)]">
              <th className="px-3 text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-secondary)]">Agent</th>
              <th className="px-3 text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-secondary)]">Contact</th>
              <th className="px-3 text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-secondary)]">Status</th>
              <th className="px-3 text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-secondary)]">Duration</th>
              <th className="px-3 text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-secondary)]">Recording</th>
              <th className="px-3 text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-secondary)]">Summary</th>
              <th className="px-3 text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-secondary)]">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--ods-border)]">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-8 text-[13px] text-[var(--ods-text-secondary)]">
                  No call records found
                </td>
              </tr>
            ) : filtered.map((call) => {
              const agentName = call.createdBy?.name || "Unknown";
              const hasAudio = !!(call.telnyxRecordingId || call.recordingUrl);
              const audioOpen = expandedAudioId === call.id;
              return (
                <React.Fragment key={call.id}>
                <tr
                  onClick={() => navigate(`/history/${call.id}`)}
                  className="h-8 hover:bg-[var(--ods-bg-secondary)] transition-colors cursor-pointer"
                >
                  <td className="px-3">
                    <div className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-[var(--ods-text-tertiary)]" />
                      <span className="text-[13px] font-medium truncate max-w-[150px] cursor-pointer hover:text-[var(--ods-brand-600)] transition-colors">{agentName}</span>
                    </div>
                  </td>
                  <td className="px-3">
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-[var(--ods-text-tertiary)]" />
                      <span className="text-[13px] font-medium text-[var(--ods-text-primary)] truncate max-w-[200px]">{recordNameOf(call)}</span>
                    </div>
                  </td>
                  <td className="px-3"><StatusBadge status={call.status ?? "unknown"} /></td>
                  <td className="px-3 text-[13px] text-[var(--ods-text-secondary)]">{call.durationSeconds}s</td>
                  <td className="px-3">
                    {hasAudio ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedAudioId(audioOpen ? null : call.id);
                        }}
                        className="inline-flex items-center gap-1 text-[12px] text-[var(--ods-brand-600)] hover:underline"
                      >
                        <AudioLines className="w-3.5 h-3.5" />
                        {audioOpen ? "Hide" : "Play"}
                      </button>
                    ) : (
                      <span className="text-[11px] text-[var(--ods-text-tertiary)]">—</span>
                    )}
                  </td>
                  <td className="px-3 text-[13px] text-[var(--ods-text-secondary)] max-w-xs truncate">{call.summary ?? "—"}</td>
                  <td className="px-3 text-[12px] text-[var(--ods-text-tertiary)]">{call.created_at ? new Date(call.created_at).toLocaleString() : "—"}</td>
                </tr>
                {audioOpen && (
                  <tr key={`${call.id}-audio`}>
                    <td colSpan={7} className="px-3 py-2 bg-[var(--ods-bg-secondary)]">
                      <audio
                        controls
                        preload="none"
                        src={call.telnyxRecordingId ? `/api/calls/${call.id}/audio` : call.recordingUrl!}
                        className="w-full max-w-xl"
                      />
                    </td>
                  </tr>
                )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
