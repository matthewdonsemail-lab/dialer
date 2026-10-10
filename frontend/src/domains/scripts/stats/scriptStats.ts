import type { Script } from "@/domains/scripts/data";
import type { AgencyCallRecord } from "@/domains/calls/data";
import { callStatusLabel, dispositionTypeOfStatus } from "@/domains/calls/disposition";

/*
 * Script performance. A script is shown to the agent during a call when the
 * contact belongs to the script's campaign (see CallScriptWidget), so a
 * script's calls are the calls made to contacts in that campaign. Scripts
 * sharing a campaign share its calls; there is no per-call record of which
 * script was on screen. `prospects` only needs the contacts that have calls
 * (looked up by id); campaign sizes come from server counts.
 */

export interface ProspectLite {
  id: string;
  campaign_id?: string | null;
}

/** Fewer calls than this and the verdict is "Not enough calls". */
export const MIN_CALLS_FOR_VERDICT = 10;

export type Verdict = "strong" | "average" | "weak" | "low-data" | "unused";

export const VERDICTS: Record<Verdict, { label: string; color: string; className: string; note: string }> = {
  strong: { label: "Strong", color: "#22c55e", className: "bg-emerald-500/15 text-emerald-700", note: "positive rate 10%+ above average" },
  average: { label: "Average", color: "#f59e0b", className: "bg-amber-500/15 text-amber-700", note: "within 10% of average" },
  weak: { label: "Weak", color: "#ef4444", className: "bg-red-500/15 text-red-700", note: "positive rate 10%+ below average" },
  "low-data": { label: "Not enough calls", color: "#9ca3af", className: "bg-[var(--ods-bg-tertiary)] text-[var(--ods-text-secondary)]", note: `under ${MIN_CALLS_FOR_VERDICT} calls` },
  unused: { label: "Not in use", color: "#d1d5db", className: "bg-[var(--ods-bg-tertiary)] text-[var(--ods-text-tertiary)]", note: "no campaign linked" },
};

export interface ScriptStats {
  calls: AgencyCallRecord[];
  contacts: number;
  conversations: number;
  convoRate: number | null;
  positive: number;
  negative: number;
  positiveRate: number | null;
  appointments: number;
  avgScore: number | null;
  talkSeconds: number;
  agents: string[];
  /** Other scripts on the same campaign, which share these calls. */
  sharedWith: number;
  dispositions: { status: string; label: string; count: number; positive: boolean }[];
  verdict: Verdict;
}

export interface Baseline {
  positiveRate: number | null;
  convoRate: number | null;
  avgScore: number | null;
}

function rates(calls: AgencyCallRecord[], conversationSeconds: number) {
  const conversations = calls.filter((c) => (c.durationSeconds ?? 0) >= conversationSeconds).length;
  const positive = calls.filter((c) => dispositionTypeOfStatus(c.status) === "positive").length;
  const negative = calls.filter((c) => dispositionTypeOfStatus(c.status) === "negative").length;
  const scored = calls.filter((c) => c.aiScore != null);
  return {
    conversations,
    positive,
    negative,
    convoRate: calls.length ? conversations / calls.length : null,
    positiveRate: positive + negative ? positive / (positive + negative) : null,
    avgScore: scored.length ? scored.reduce((s, c) => s + (c.aiScore ?? 0), 0) / scored.length : null,
  };
}

/** Team-wide numbers every script is compared against. */
export function baseline(calls: AgencyCallRecord[], conversationSeconds: number): Baseline {
  const r = rates(calls, conversationSeconds);
  return { positiveRate: r.positiveRate, convoRate: r.convoRate, avgScore: r.avgScore };
}

export function scriptStats(
  script: Script,
  scripts: Script[],
  calls: AgencyCallRecord[],
  prospects: ProspectLite[],
  conversationSeconds: number,
  base: Baseline,
  /** Contacts per campaign id, counted by the server. */
  campaignSizes: Record<string, number> = {},
): ScriptStats {
  const campaignId = script.campaignId;
  const contactIds = new Set(campaignId ? prospects.filter((p) => p.campaign_id === campaignId).map((p) => p.id) : []);
  const mine = calls.filter((c) => c.agencyProspectId && contactIds.has(c.agencyProspectId));
  const r = rates(mine, conversationSeconds);

  const byStatus = new Map<string, number>();
  for (const c of mine) {
    const s = String(c.status ?? "UNKNOWN").toUpperCase();
    byStatus.set(s, (byStatus.get(s) ?? 0) + 1);
  }

  let verdict: Verdict;
  if (!campaignId) verdict = "unused";
  else if (mine.length < MIN_CALLS_FOR_VERDICT || r.positiveRate == null || base.positiveRate == null) verdict = "low-data";
  else if (r.positiveRate >= base.positiveRate * 1.1) verdict = "strong";
  else if (r.positiveRate <= base.positiveRate * 0.9) verdict = "weak";
  else verdict = "average";

  return {
    calls: mine,
    contacts: campaignId ? (campaignSizes[campaignId] ?? contactIds.size) : 0,
    conversations: r.conversations,
    convoRate: r.convoRate,
    positive: r.positive,
    negative: r.negative,
    positiveRate: r.positiveRate,
    appointments: mine.filter((c) => String(c.status).toUpperCase() === "APPOINTMENT_SET").length,
    avgScore: r.avgScore,
    talkSeconds: mine.reduce((s, c) => s + (c.durationSeconds ?? 0), 0),
    agents: [...new Set(mine.map((c) => c.createdBy?.name).filter(Boolean) as string[])],
    sharedWith: campaignId ? scripts.filter((s) => s.id !== script.id && s.campaignId === campaignId).length : 0,
    dispositions: [...byStatus.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([status, count]) => ({ status, label: callStatusLabel(status), count, positive: dispositionTypeOfStatus(status) === "positive" })),
    verdict,
  };
}
