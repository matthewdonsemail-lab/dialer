import { Link } from "react-router-dom";
import { ArrowRight, AudioLines, MessageSquare, PhoneIncoming, PhoneOutgoing, Star, Timer, User } from "@/components/ui/icons";
import { EmptyState, ReportCard, StatTiles, type Stat } from "@/components/reports/ReportParts";
import { WHO_TIP } from "@/components/admin/ActivityTable";
import { CallQualityScores, WaveformPlayer, parseAiScores } from "@/components/calls/CallRating";
import { dispositionMeta } from "@/components/calls/DispositionBadge";
import { callStatusLabel } from "@/lib/call-outcome";
import type { AgencyCallRecord } from "@/hooks/use-call-logs";

export const DASH = "—";

export function durationText(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function keyPoints(raw?: string | null): string[] {
  try {
    const points = JSON.parse(raw || "[]");
    return Array.isArray(points) ? points.filter((p) => typeof p === "string" && p.trim()) : [];
  } catch {
    return [];
  }
}

type CallLike = Pick<
  AgencyCallRecord,
  "id" | "status" | "durationSeconds" | "aiScore" | "aiSentiment" | "direction" | "fromNumber" | "toNumber" | "createdBy"
>;

/**
 * The six headline tiles for one call. Shared by the Call History quick view
 * and the call review page so both always read the same way.
 */
export function callStats(call: CallLike, conversationSeconds: number): Stat[] {
  const seconds = call.durationSeconds ?? 0;
  const isConversation = seconds >= conversationSeconds;
  const disposition = dispositionMeta(call.status);
  const inbound = String(call.direction ?? "").toUpperCase() === "INBOUND";
  return [
    {
      label: "Disposition",
      value: disposition.label,
      icon: disposition.icon,
      tone: disposition.type === "positive" ? "positive" : disposition.type === "negative" ? "negative" : "default",
      tip: {
        title: "Disposition",
        what: "How the call ended, as set by the agent or the phone system.",
        key: [
          { color: "#22c55e", label: "Positive", note: "good outcome" },
          { color: "#ef4444", label: "Negative", note: "bad outcome" },
          { color: "#9ca3af", label: "Neutral", note: "system status" },
        ],
      },
    },
    {
      label: "Duration",
      value: durationText(seconds),
      icon: Timer,
      tone: isConversation ? "positive" : "default",
      tip: {
        title: "Duration",
        what: isConversation ? "Long enough to count as a conversation in Reports." : "Too short to count as a conversation in Reports.",
        formula: ["Connected call", "≥", `${conversationSeconds}s`, "=", "Conversation"],
      },
    },
    {
      label: "AI score",
      value: call.aiScore != null ? `${call.aiScore}` : DASH,
      icon: Star,
      tone: call.aiScore == null ? "default" : call.aiScore >= 70 ? "positive" : call.aiScore < 40 ? "negative" : "warning",
      tip: {
        title: "AI score",
        what: "An overall 0-100 rating of the call from the transcript.",
        key: [
          { color: "#22c55e", label: "70+", note: "strong call" },
          { color: "#f59e0b", label: "40-69", note: "mixed" },
          { color: "#ef4444", label: "Under 40", note: "weak call" },
        ],
      },
    },
    {
      label: "Sentiment",
      value: call.aiSentiment ? String(call.aiSentiment).charAt(0) + String(call.aiSentiment).slice(1).toLowerCase() : DASH,
      icon: MessageSquare,
      tip: { title: "Sentiment", what: "How the prospect felt about the call, read from the transcript." },
    },
    {
      label: "Agent",
      value: call.createdBy?.name || "Unknown",
      icon: User,
      tip: { ...WHO_TIP, title: "Agent", what: "The team member who made or took this call." },
    },
    {
      label: "Direction",
      value: inbound ? "Inbound" : "Outbound",
      icon: inbound ? PhoneIncoming : PhoneOutgoing,
      tip: { title: "Direction", what: inbound ? "The contact called in." : "The agent dialed out.", formula: [call.fromNumber || DASH, "→", call.toNumber || DASH] },
    },
  ];
}

/**
 * Quick view shown when a Call History row is expanded: the same tiles and
 * cards as the review page (recording, transcript, quality), plus a link to
 * the full review.
 */
export function CallQuickView({ call, conversationSeconds }: { call: AgencyCallRecord; conversationSeconds: number }) {
  const hasAudio = !!(call.telnyxRecordingId || call.recordingUrl);
  const scores = parseAiScores(call.aiScores);
  const points = keyPoints(call.aiKeyPoints);
  const summary = call.aiSummary || call.summary;

  return (
    <div className="space-y-4 py-1 whitespace-normal cursor-default" onClick={(e) => e.stopPropagation()}>
      <StatTiles stats={callStats(call, conversationSeconds)} />
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-4">
        <div className="space-y-4 min-w-0">
          <ReportCard
            title="Recording"
            unit={hasAudio ? durationText(call.durationSeconds ?? 0) : "Missing"}
            tip={{ title: "Recording", icon: AudioLines, what: "The call audio. Click the waveform to jump to any point." }}
            aside={
              <Link
                to={`/history/${call.id}`}
                className="h-8 px-3 inline-flex items-center gap-2 rounded-md border border-[var(--ods-border-strong)] bg-[var(--ods-bg-primary)] text-[13px] font-semibold text-[var(--ods-brand-600)] hover:bg-[var(--ods-hover)]"
              >
                Open full review
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            }
          >
            {hasAudio ? (
              <WaveformPlayer src={call.recordingUrl} callId={call.telnyxRecordingId ? call.id : null} seed={call.id} />
            ) : (
              <EmptyState>No recording yet for this call.</EmptyState>
            )}
          </ReportCard>
          <ReportCard
            title={summary ? "Summary" : "Transcript"}
            unit={call.transcriptionStatus ? callStatusLabel(call.transcriptionStatus) : "None"}
            tip={{ title: "Summary & Transcript", icon: MessageSquare, what: "The AI recap of the call, then what was said, transcribed from the recording." }}
          >
            {summary || call.transcript ? (
              <div className="space-y-3">
                {summary && <p className="text-[14px] leading-relaxed font-medium text-[var(--ods-text-primary)]">{summary}</p>}
                {points.length > 0 && (
                  <ul className="flex flex-wrap gap-1.5">
                    {points.map((p, i) => (
                      <li key={i} className="px-2 py-1 rounded-md border border-[var(--ods-border)] bg-[var(--ods-bg-secondary)] text-[12px] font-semibold text-[var(--ods-text-primary)]">
                        {p}
                      </li>
                    ))}
                  </ul>
                )}
                {call.transcript && (
                  <p className="max-h-40 overflow-y-auto rounded-[8px] bg-[var(--ods-bg-secondary)] p-3 text-[13px] leading-relaxed text-[var(--ods-text-secondary)] whitespace-pre-wrap">
                    {call.transcript}
                  </p>
                )}
              </div>
            ) : (
              <EmptyState>No summary or transcript yet.</EmptyState>
            )}
          </ReportCard>
        </div>
        <ReportCard
          title="Call Quality"
          unit={scores ? "Scored" : "Not scored"}
          tip={{ title: "Call Quality", icon: Star, what: "Five ratings out of 5, read from the transcript.", use: "Hover the eye on each for what it measures." }}
        >
          <CallQualityScores
            scores={scores}
            fallback={<EmptyState>{call.transcript ? "Not analyzed yet. Open the full review to analyze it." : "Analysis unlocks once a transcript is ready."}</EmptyState>}
          />
        </ReportCard>
      </div>
    </div>
  );
}
