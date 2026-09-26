import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import { PageCanvas } from "@/components/common/PageCanvas";
import { WidgetCard } from "@/components/ui/WidgetCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Spokes } from "@/components/ui/Spinner";
import { ArrowLeft, Phone, Clock, User, FileText, Calendar, AudioLines } from "lucide-react";

export function CallDetailPage() {
  const { callId } = useParams<{ callId: string }>();
  const navigate = useNavigate();

  const { data: call, isLoading: callLoading } = useQuery<any>({
    queryKey: ["call", callId],
    queryFn: () => api.calls.get(callId ?? ""),
    enabled: !!callId,
    staleTime: 30000,
  });

  const { data: lead } = useQuery<any>({
    queryKey: ["lead", call?.agencyLeadId],
    queryFn: () => api.leads.get(call?.agencyLeadId ?? ""),
    enabled: !!call?.agencyLeadId,
    staleTime: Infinity,
  });

  const { data: prospect } = useQuery<any>({
    queryKey: ["prospect", call?.agencyProspectId],
    queryFn: () => api.prospects.get(call?.agencyProspectId ?? ""),
    enabled: !!call?.agencyProspectId,
    staleTime: Infinity,
  });

  if (callLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spokes className="h-8 w-8 text-[var(--ods-brand-600)]" />
      </div>
    );
  }

  if (!call) {
    return (
      <div className="text-center py-12">
        <p className="text-[13px] text-[var(--ods-text-secondary)]">Call record not found</p>
        <button
          onClick={() => navigate("/history")}
          className="mt-4 text-[13px] text-[var(--ods-brand-600)] hover:text-[var(--ods-brand-700)]"
        >
          Back to Call History
        </button>
      </div>
    );
  }

  const record = lead ?? prospect;
  const agentName = call.createdBy?.name || "Unknown";
  const recordName = record
    ? `${record.first_name ?? ""} ${record.last_name ?? ""}`.trim() || record.phone || call.toNumber || "ΓÇö"
    : call.toNumber || "ΓÇö";
  const durationMinutes = Math.floor((call.durationSeconds ?? 0) / 60);
  const durationSeconds = (call.durationSeconds ?? 0) % 60;
  const duration = durationMinutes > 0 ? `${durationMinutes}m ${durationSeconds}s` : `${durationSeconds}s`;

  return (
    <PageCanvas
      title={
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/history")}
            aria-label="Back to call history"
            className="p-1 -ml-1 text-[var(--ods-text-tertiary)] hover:text-[var(--ods-text-primary)] rounded-[4px] hover:bg-[var(--ods-bg-secondary)] transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <span className="text-[13px] font-semibold">Call Details</span>
        </div>
      }
      subtitle={`Call ID: ${call.id}`}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Call Information */}
        <WidgetCard title="Call Information" icon={Phone}>
          <dl className="flex flex-col gap-[var(--ods-sp-3)]">
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-tertiary)]">Status</dt>
              <dd className="mt-1"><StatusBadge status={call.status ?? "unknown"} /></dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-tertiary)]">Duration</dt>
              <dd className="mt-1 text-[13px] text-[var(--ods-text-primary)]">{duration}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-tertiary)]">Direction</dt>
              <dd className="mt-1 text-[13px] text-[var(--ods-text-primary)] capitalize">{(call.direction || "ΓÇö").toLowerCase()}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-tertiary)]">From ΓåÆ To</dt>
              <dd className="mt-1 text-[13px] text-[var(--ods-text-primary)] font-mono">
                {call.fromNumber || "ΓÇö"} ΓåÆ {call.toNumber || "ΓÇö"}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-tertiary)]">Started At</dt>
              <dd className="mt-1 text-[13px] text-[var(--ods-text-primary)]">
                {call.startedAt ? new Date(call.startedAt).toLocaleString() : "ΓÇö"}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-tertiary)]">Ended At</dt>
              <dd className="mt-1 text-[13px] text-[var(--ods-text-primary)]">
                {call.endedAt ? new Date(call.endedAt).toLocaleString() : "ΓÇö"}
              </dd>
            </div>
          </dl>
        </WidgetCard>

        {/* Participants */}
        <WidgetCard title="Participants" icon={User}>
          <dl className="flex flex-col gap-[var(--ods-sp-3)]">
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-tertiary)]">Agent</dt>
              <dd className="mt-1 text-[13px] text-[var(--ods-text-primary)]">{agentName}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-tertiary)]">Lead/Prospect</dt>
              <dd className="mt-1 text-[13px] text-[var(--ods-text-primary)]">{recordName}</dd>
            </div>
            {record && (
              <>
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-tertiary)]">Company</dt>
                  <dd className="mt-1 text-[13px] text-[var(--ods-text-secondary)]">{record.company || record.niche || "ΓÇö"}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-tertiary)]">Phone</dt>
                  <dd className="mt-1 text-[13px] text-[var(--ods-text-secondary)] font-mono">{record.phone || "ΓÇö"}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-tertiary)]">Email</dt>
                  <dd className="mt-1 text-[13px] text-[var(--ods-text-secondary)]">{record.email || "ΓÇö"}</dd>
                </div>
              </>
            )}
          </dl>
        </WidgetCard>

        {/* Recording + transcript (Telnyx server-side; proxied so URLs never expire) */}
        <WidgetCard title="Recording" icon={AudioLines}>
          {call.telnyxRecordingId || call.recordingUrl ? (
            <audio controls src={call.telnyxRecordingId ? `/api/calls/${call.id}/audio` : call.recordingUrl} className="w-full" />
          ) : (
            <p className="text-[13px] text-[var(--ods-text-secondary)]">No recording yet</p>
          )}
          <p className="mt-2 text-[11px] text-[var(--ods-text-tertiary)]">
            Transcription: {call.transcriptionStatus ?? "NONE"}
          </p>
          {call.transcript && (
            <p className="mt-2 text-[13px] text-[var(--ods-text-secondary)] whitespace-pre-wrap max-h-48 overflow-y-auto">
              {call.transcript}
            </p>
          )}
        </WidgetCard>

        {/* Meeting (booked from this call) */}
        <WidgetCard title="Meeting" icon={Calendar}>
          {call.meetingUrl ? (
            <dl className="flex flex-col gap-[var(--ods-sp-3)]">
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-tertiary)]">Link</dt>
                <dd className="mt-1">
                  <a href={call.meetingUrl} target="_blank" rel="noreferrer" className="text-[13px] text-[var(--ods-brand-600)] hover:underline break-all">
                    {call.meetingUrl}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-tertiary)]">Provider</dt>
                <dd className="mt-1 text-[13px] text-[var(--ods-text-primary)]">{call.meetingProvider ?? "ΓÇö"}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-tertiary)]">When</dt>
                <dd className="mt-1 text-[13px] text-[var(--ods-text-primary)]">
                  {call.meetingAt ? new Date(call.meetingAt).toLocaleString() : "ΓÇö"}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-tertiary)]">Status</dt>
                <dd className="mt-1"><StatusBadge status={call.meetingStatus ?? "unknown"} /></dd>
              </div>
            </dl>
          ) : (
            <p className="text-[13px] text-[var(--ods-text-secondary)]">No meeting booked from this call yet</p>
          )}
        </WidgetCard>

        {/* Notes */}
        <WidgetCard title="Summary" icon={FileText}>
          <p className="text-[13px] text-[var(--ods-text-secondary)] whitespace-pre-wrap min-h-[100px]">
            {call.summary || "No summary recorded"}
          </p>
        </WidgetCard>

        {/* Diagnostics (SIP event trail for post-mortem) */}
        {call.debugLog && (
          <WidgetCard title="Diagnostics" icon={FileText}>
            <pre className="text-[11px] text-[var(--ods-text-secondary)] whitespace-pre-wrap max-h-64 overflow-y-auto font-mono">
              {call.debugLog.slice(0, 4000)}
            </pre>
          </WidgetCard>
        )}

        {/* Technical Details */}
        <WidgetCard title="Technical Details" icon={Clock}>
          <dl className="flex flex-col gap-[var(--ods-sp-3)]">
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-tertiary)]">Telnyx Call ID</dt>
              <dd className="mt-1 text-[12px] text-[var(--ods-text-secondary)] font-mono break-all">{call.telnyxCallId || "ΓÇö"}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-tertiary)]">Telnyx Recording ID</dt>
              <dd className="mt-1 text-[12px] text-[var(--ods-text-secondary)] font-mono break-all">{call.telnyxRecordingId || "ΓÇö"}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-tertiary)]">Created At</dt>
              <dd className="mt-1 text-[13px] text-[var(--ods-text-primary)]">
                {call.created_at ? new Date(call.created_at).toLocaleString() : "ΓÇö"}
              </dd>
            </div>
          </dl>
        </WidgetCard>
      </div>
    </PageCanvas>
  );
}
