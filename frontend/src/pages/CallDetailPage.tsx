import { useEffect, useMemo } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import {
  Activity,
  ArrowLeft,
  AudioLines,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  MessageSquare,
  Phone,
  RefreshCw,
  Star,
  type IconComponent,
} from "@/components/ui/icons";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { DetailPageSkeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { CallQualityScores, WaveformPlayer, parseAiScores } from "@/components/calls/CallRating";
import { EmptyState, HeadCell, ReportCard, ReportTable, StatTiles, TD, TR } from "@/components/reports/ReportParts";
import { DASH, callStats, durationText, keyPoints } from "@/components/calls/CallInsight";
import { ACTION_KEY_TIP, ActivityTable } from "@/components/admin/ActivityTable";
import { useCalls } from "@/hooks/use-call-logs";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { useReportSettings } from "@/hooks/use-report-settings";
import { callStatusLabel } from "@/lib/call-outcome";
import { formatMinutes } from "@/lib/reports";
import { resolveActivities, timeAgo, useDialerRecords, useRecordActivity } from "@/lib/admin";

type Tab = "overview" | "recording" | "ai" | "activity" | "technical";
const TABS: { key: Tab; label: string; icon: IconComponent }[] = [
  { key: "overview", label: "Overview", icon: Phone },
  { key: "recording", label: "Recording", icon: AudioLines },
  { key: "ai", label: "AI Review", icon: Star },
  { key: "activity", label: "Activity", icon: Activity },
  { key: "technical", label: "Technical", icon: FileText },
];

function when(iso?: string | null): string {
  return iso ? new Date(iso).toLocaleString() : DASH;
}



/**
 * Call review: one call from Call History, laid out like Reports and Admin
 * (title pill, stat tiles, tabs, cards with eye tooltips). Its Activity tab
 * uses the Admin activity table for the history of the call and its contact.
 */
export function CallDetailPage() {
  const { callId } = useParams<{ callId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { error: toastError, success } = useToast();
  const { conversationSeconds } = useReportSettings();
  const [tab, setTab] = usePersistedState<Tab>("call-review-tab", "overview");
  // Links like /history/:id?tab=recording open straight on that tab.
  const [params] = useSearchParams();
  useEffect(() => {
    const wanted = params.get("tab");
    if (wanted && TABS.some((t) => t.key === wanted)) setTab(wanted as Tab);
  }, [params, setTab]);

  const { data: call, isLoading } = useQuery<any>({
    queryKey: ["call", callId],
    queryFn: () => api.calls.get(callId ?? ""),
    enabled: !!callId,
    staleTime: 30000,
  });

  // Previous / next in the same order as Call History (newest first).
  const { data: calls } = useCalls();
  const ordered = useMemo(
    () => [...(calls ?? [])].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [calls],
  );
  const position = ordered.findIndex((c) => c.id === callId);
  const newer = position > 0 ? ordered[position - 1] : null;
  const older = position >= 0 && position < ordered.length - 1 ? ordered[position + 1] : null;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["call", callId] });
    queryClient.invalidateQueries({ queryKey: ["calls"] });
    queryClient.invalidateQueries({ queryKey: ["record-activity"] });
  };
  const analyze = useMutation({
    mutationFn: () => api.calls.analyze(callId ?? ""),
    onSuccess: () => {
      refresh();
      success("Analysis complete", "The AI review is ready.");
    },
    onError: (err: any) => toastError("Analysis failed", err?.message || "Try again."),
  });
  const reconcile = useMutation({
    mutationFn: () => api.calls.reconcile(callId ?? ""),
    onSuccess: (r) => {
      refresh();
      if (r?.attached) success("Recording attached", "Telnyx had a recording for this call.");
      else toastError("No recording found", "Telnyx has no recording for this call yet.");
    },
    onError: (err: any) => toastError("Reconcile failed", err?.message || "Try again."),
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

  const history = useRecordActivity([
    { object: "call", id: call?.id },
    { object: "prospect", id: call?.agencyProspectId },
    { object: "lead", id: call?.agencyLeadId },
  ]);
  const records = useDialerRecords(history.data);
  const events = useMemo(() => resolveActivities(history.data, records), [history.data, records]);

  if (isLoading) return <DetailPageSkeleton />;

  if (!call) {
    return (
      <div className="p-8">
        <EmptyState>
          This call could not be found. It may have been deleted in Twenty.{" "}
          <Link to="/history" className="font-semibold text-[var(--ods-brand-600)] hover:underline">
            Back to Call History
          </Link>
        </EmptyState>
      </div>
    );
  }

  const record = lead ?? prospect;
  const contactHref = call.agencyProspectId ? `/contacts/${call.agencyProspectId}` : call.agencyLeadId ? `/leads/${call.agencyLeadId}` : null;
  const contactName = record ? `${record.first_name ?? ""} ${record.last_name ?? ""}`.trim() || record.company || record.phone : null;
  const agent = call.createdBy?.name || "Unknown";
  const seconds = call.durationSeconds ?? 0;
  const inbound = String(call.direction ?? "").toUpperCase() === "INBOUND";
  const hasAudio = !!(call.telnyxRecordingId || call.recordingUrl);
  const scores = parseAiScores(call.aiScores);
  const points = keyPoints(call.aiKeyPoints);
  const summary = call.aiSummary || call.summary;

  const stats = callStats(call, conversationSeconds);

  const detailRows: [string, React.ReactNode][] = [
    ["Agent", agent],
    [
      "Contact",
      contactHref && contactName ? (
        <Link to={contactHref} className="font-semibold text-[var(--ods-brand-600)] hover:underline">
          {contactName}
        </Link>
      ) : (
        contactName || call.toNumber || DASH
      ),
    ],
    ["Company", record?.company || record?.niche || DASH],
    ["From → To", `${call.fromNumber || DASH} → ${call.toNumber || DASH}`],
    ["Started", when(call.startedAt)],
    ["Ended", when(call.endedAt)],
    ["Talk time", formatMinutes(seconds / 60)],
  ];

  return (
    <div className="flex flex-col h-full min-h-0 overflow-y-auto bg-[var(--ods-bg-secondary)]">
      <div className="px-5 pt-5 pb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => navigate("/history")}
            aria-label="Back to Call History"
            title="Back to Call History"
            className="w-9 h-9 shrink-0 inline-flex items-center justify-center rounded-[8px] border border-[var(--ods-border-strong)] bg-[var(--ods-bg-primary)] text-[var(--ods-text-secondary)] hover:text-[var(--ods-text-primary)] hover:bg-[var(--ods-hover)]"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <SectionTitle
            as="h1"
            title={contactName || call.toNumber || "Call Review"}
            pill={new Date(call.startedAt ?? call.created_at).toLocaleDateString()}
            info={{
              title: "Call Review",
              icon: Phone,
              what: "Everything about one call: outcome, recording, AI review and the history of the call and its contact.",
              use: "Use the arrows on the right to step through Call History.",
            }}
          />
        </div>
        <div className="flex items-center gap-2">
          {position >= 0 && (
            <span className="text-[13px] font-semibold text-[var(--ods-text-secondary)] tabular-nums">
              {position + 1} of {ordered.length}
            </span>
          )}
          <NavButton to={newer ? `/history/${newer.id}` : null} label="Newer call" icon={ChevronLeft} />
          <NavButton to={older ? `/history/${older.id}` : null} label="Older call" icon={ChevronRight} />
        </div>
      </div>

      <div className="px-5">
        <div role="tablist" className="grid grid-cols-2 md:grid-cols-5 rounded-[10px] border border-[var(--ods-border)] bg-[var(--ods-bg-primary)] p-1 gap-1">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`h-10 rounded-[8px] inline-flex items-center justify-center gap-2 text-[14px] font-semibold transition-colors ${
                tab === key
                  ? "bg-[var(--ods-brand-600)] text-white"
                  : "text-[var(--ods-text-secondary)] hover:bg-[var(--ods-hover)] hover:text-[var(--ods-text-primary)]"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
              {key === "activity" && events.length > 0 && (
                <span className={`px-1.5 rounded-md text-[12px] ${tab === key ? "bg-white/20" : "bg-[var(--ods-bg-tertiary)]"}`}>{events.length}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="p-5 space-y-4">
        <StatTiles stats={stats} />

        {tab === "overview" && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ReportCard title="Call Details" unit={inbound ? "Inbound" : "Outbound"} tip={{ title: "Call Details", icon: Phone, what: "Who was on the call, the numbers used, and when it happened." }}>
              <KeyValueTable rows={detailRows} />
            </ReportCard>
            <ReportCard
              title="Summary"
              unit={call.aiSummary ? "AI" : "Notes"}
              tip={{ title: "Summary", icon: FileText, what: "A short recap of the call, written by the AI when available, otherwise the agent's notes." }}
            >
              {summary ? (
                <div className="space-y-3">
                  <p className="text-[14px] leading-relaxed text-[var(--ods-text-primary)] whitespace-pre-wrap">{summary}</p>
                  {points.length > 0 && <KeyPoints points={points} />}
                </div>
              ) : (
                <EmptyState>No summary for this call yet.</EmptyState>
              )}
            </ReportCard>
            <ReportCard title="Meeting" unit={call.meetingUrl ? "Booked" : "None"} tip={{ title: "Meeting", icon: Calendar, what: "A meeting booked during this call, if any." }}>
              {call.meetingUrl ? (
                <KeyValueTable
                  rows={[
                    [
                      "Link",
                      <a href={call.meetingUrl} target="_blank" rel="noreferrer" className="font-semibold text-[var(--ods-brand-600)] hover:underline break-all">
                        Open meeting
                      </a>,
                    ],
                    ["Provider", call.meetingProvider ?? DASH],
                    ["When", when(call.meetingAt)],
                    ["Status", call.meetingStatus ? callStatusLabel(call.meetingStatus) : DASH],
                  ]}
                />
              ) : (
                <EmptyState>No meeting was booked from this call.</EmptyState>
              )}
            </ReportCard>
            <ReportCard
              title="Latest Activity"
              unit={`${events.length} events`}
              tip={{ title: "Latest Activity", icon: Activity, what: "The most recent changes to this call and its contact.", key: ACTION_KEY_TIP, use: "The Activity tab has the full history." }}
            >
              <ActivityBody loading={history.isLoading} error={history.error as Error | null} events={events.slice(0, 5)} compact />
            </ReportCard>
          </div>
        )}

        {tab === "recording" && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ReportCard
              title="Recording"
              unit={hasAudio ? durationText(seconds) : "Missing"}
              tip={{ title: "Recording", icon: AudioLines, what: "The call audio, streamed through the dialer so the link never expires.", use: "If it is missing, Reconcile asks Telnyx for it again." }}
              aside={
                !hasAudio ? (
                  <button
                    onClick={() => reconcile.mutate()}
                    disabled={reconcile.isPending}
                    className="h-8 px-3 inline-flex items-center gap-2 rounded-md border border-[var(--ods-border-strong)] text-[13px] font-semibold text-[var(--ods-brand-600)] hover:bg-[var(--ods-hover)] disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${reconcile.isPending ? "animate-spin" : ""}`} />
                    {reconcile.isPending ? "Checking Telnyx…" : "Reconcile with Telnyx"}
                  </button>
                ) : undefined
              }
            >
              {hasAudio ? (
                <WaveformPlayer src={call.recordingUrl} callId={call.telnyxRecordingId ? call.id : null} seed={call.id} />
              ) : (
                <EmptyState>No recording yet for this call.</EmptyState>
              )}
            </ReportCard>
            <ReportCard
              title="Transcript"
              unit={call.transcriptionStatus ? callStatusLabel(call.transcriptionStatus) : "None"}
              tip={{ title: "Transcript", icon: MessageSquare, what: "What was said on the call, transcribed from the recording.", formula: ["Recording", "→", "Transcript", "→", "AI review"] }}
            >
              {call.transcript ? (
                <p className="max-h-[420px] overflow-y-auto text-[14px] leading-relaxed text-[var(--ods-text-primary)] whitespace-pre-wrap">{call.transcript}</p>
              ) : (
                <EmptyState>{hasAudio ? "The transcript is not ready yet." : "A transcript appears once there is a recording."}</EmptyState>
              )}
            </ReportCard>
          </div>
        )}

        {tab === "ai" && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ReportCard
              title="Call Quality"
              unit={scores ? "Scored" : "Not scored"}
              tip={{ title: "Call Quality", icon: Star, what: "Five ratings out of 5, read from the transcript.", use: "Hover a bar for what it measures." }}
              aside={
                call.transcript ? (
                  <button
                    onClick={() => analyze.mutate()}
                    disabled={analyze.isPending}
                    className="h-8 px-3 inline-flex items-center gap-2 rounded-md border border-[var(--ods-border-strong)] text-[13px] font-semibold text-[var(--ods-brand-600)] hover:bg-[var(--ods-hover)] disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${analyze.isPending ? "animate-spin" : ""}`} />
                    {analyze.isPending ? "Analyzing…" : scores ? "Re-analyze" : "Analyze this call"}
                  </button>
                ) : undefined
              }
            >
              <CallQualityScores
                scores={scores}
                fallback={<EmptyState>{call.transcript ? "This call has not been analyzed yet." : "Analysis unlocks once a transcript is ready."}</EmptyState>}
              />
            </ReportCard>
            <ReportCard
              title="Key Points"
              unit={`${points.length}`}
              tip={{ title: "Key Points", icon: FileText, what: "The main things the AI picked out of the conversation." }}
            >
              {points.length ? <KeyPoints points={points} /> : <EmptyState>No key points yet.</EmptyState>}
              {(call.aiModel || call.aiAnalyzedAt || typeof call.aiConfidence === "number") && (
                <div className="mt-4">
                  <KeyValueTable
                    rows={[
                      ["Model", call.aiModel || DASH],
                      ["Analyzed", call.aiAnalyzedAt ? `${when(call.aiAnalyzedAt)} (${timeAgo(call.aiAnalyzedAt)})` : DASH],
                      ["Confidence", typeof call.aiConfidence === "number" ? `${Math.round(call.aiConfidence * 100)}%` : DASH],
                    ]}
                  />
                </div>
              )}
            </ReportCard>
          </div>
        )}

        {tab === "activity" && (
          <ReportCard
            title="Call & Contact History"
            unit={`${events.length} events`}
            tip={{
              title: "Call & Contact History",
              icon: Activity,
              what: "Every change to this call and to the contact it was made to, newest first. Same table as Admin → Activity Log.",
              key: ACTION_KEY_TIP,
            }}
          >
            <ActivityBody loading={history.isLoading} error={history.error as Error | null} events={events} />
          </ReportCard>
        )}

        {tab === "technical" && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ReportCard title="Technical Details" unit="Telnyx" tip={{ title: "Technical Details", icon: Clock, what: "IDs and timestamps from the phone provider, for support and debugging." }}>
              <KeyValueTable
                rows={[
                  ["Call ID", call.id],
                  ["Telnyx call ID", call.telnyxCallId || DASH],
                  ["Telnyx recording ID", call.telnyxRecordingId || DASH],
                  ["Created", when(call.created_at)],
                  ["Last updated", when(call.updated_at)],
                ]}
              />
            </ReportCard>
            <ReportCard
              title="Diagnostics"
              unit={call.debugLog ? "SIP log" : "None"}
              tip={{ title: "Diagnostics", icon: FileText, what: "The connection event trail, kept to troubleshoot failed or dropped calls." }}
            >
              {call.debugLog ? (
                <pre className="max-h-[420px] overflow-y-auto whitespace-pre-wrap text-[12px] text-[var(--ods-text-secondary)]">{call.debugLog.slice(0, 4000)}</pre>
              ) : (
                <EmptyState>No diagnostics were recorded for this call.</EmptyState>
              )}
            </ReportCard>
          </div>
        )}
      </div>
    </div>
  );
}

function NavButton({ to, label, icon: Icon }: { to: string | null; label: string; icon: IconComponent }) {
  const cls =
    "w-9 h-9 inline-flex items-center justify-center rounded-[8px] border border-[var(--ods-border-strong)] bg-[var(--ods-bg-primary)] text-[var(--ods-text-secondary)]";
  if (!to) {
    return (
      <span aria-disabled="true" title={label} className={`${cls} opacity-40 cursor-not-allowed`}>
        <Icon className="w-4 h-4" />
      </span>
    );
  }
  return (
    <Link to={to} aria-label={label} title={label} className={`${cls} hover:text-[var(--ods-text-primary)] hover:bg-[var(--ods-hover)]`}>
      <Icon className="w-4 h-4" />
    </Link>
  );
}

/** Label / value rows in the shared report table style. */
function KeyValueTable({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <ReportTable>
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label} className={TR}>
            <HeadCell className="w-[160px]">{label}</HeadCell>
            <td className={`${TD} whitespace-normal break-words`}>{value}</td>
          </tr>
        ))}
      </tbody>
    </ReportTable>
  );
}

function KeyPoints({ points }: { points: string[] }) {
  return (
    <ul className="space-y-2">
      {points.map((p, i) => (
        <li key={i} className="flex gap-2.5 text-[14px] leading-snug text-[var(--ods-text-primary)]">
          <span className="mt-0.5 w-5 h-5 shrink-0 rounded-md bg-blue-500/15 text-blue-600 text-[12px] font-bold flex items-center justify-center">{i + 1}</span>
          {p}
        </li>
      ))}
    </ul>
  );
}

function ActivityBody({ loading, error, events, compact = false }: { loading: boolean; error: Error | null; events: ReturnType<typeof resolveActivities>; compact?: boolean }) {
  if (loading) return <EmptyState>Loading history from Twenty…</EmptyState>;
  if (error) return <EmptyState>Could not load history. {error.message}</EmptyState>;
  if (events.length === 0) return <EmptyState>No recorded changes yet.</EmptyState>;
  return <ActivityTable events={events} compact={compact} />;
}
