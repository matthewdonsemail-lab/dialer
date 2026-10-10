/**
 * Campaign progress and statistics, derived from agencyCalls (nothing extra
 * is stored): a campaign's calls are calls to its contacts made after it was
 * created.
 */
import type { CallCampaign } from "@/domains/api/client";
import { callStatusLabel, dispositionTypeOfStatus } from "@/domains/calls/disposition";
import { isConnected, type ReportCall } from "@/domains/reports/data";

export interface CampaignCall extends ReportCall {
  agencyProspectId: string | null;
  toNumber: string | null;
}

export function campaignCalls(campaign: CallCampaign, calls: CampaignCall[]): CampaignCall[] {
  const members = new Set(campaign.contactIds);
  const since = new Date(campaign.createdAt).getTime();
  return calls.filter((c) => {
    if (!c.agencyProspectId || !members.has(c.agencyProspectId)) return false;
    const t = new Date(c.startedAt || c.created_at).getTime();
    return !Number.isNaN(t) && t >= since;
  });
}

export interface CampaignProgress {
  total: number;
  dialed: number;
  remaining: number;
  /** 0..1 */
  ratio: number;
  /** Contact ids not yet dialed, in campaign order. */
  remainingIds: string[];
}

export function campaignProgress(campaign: CallCampaign, calls: CampaignCall[]): CampaignProgress {
  const dialedIds = new Set(campaignCalls(campaign, calls).map((c) => c.agencyProspectId as string));
  const remainingIds = campaign.contactIds.filter((id) => !dialedIds.has(id));
  const total = campaign.contactIds.length;
  const dialed = total - remainingIds.length;
  return { total, dialed, remaining: remainingIds.length, ratio: total ? dialed / total : 0, remainingIds };
}

/** The next contact to dial after `currentId` (wrapping to the start), skipping dialed ones. */
export function nextContactId(campaign: CallCampaign, calls: CampaignCall[], currentId?: string | null): string | null {
  const { remainingIds } = campaignProgress(campaign, calls);
  const pending = remainingIds.filter((id) => id !== currentId);
  if (pending.length === 0) return null;
  if (!currentId) return pending[0];
  const order = campaign.contactIds;
  const from = order.indexOf(currentId);
  return pending.find((id) => order.indexOf(id) > from) ?? pending[0];
}

export interface CampaignStats {
  callsMade: number;
  connected: number;
  connectionRate: number;
  dialSeconds: number;
  talkSeconds: number;
  avgCallSeconds: number;
  dispositions: { label: string; status: string; count: number; positive: boolean | null }[];
}

export function campaignStats(campaign: CallCampaign, calls: CampaignCall[]): CampaignStats {
  const list = campaignCalls(campaign, calls);
  const connected = list.filter(isConnected);
  const talkSeconds = connected.reduce((s, c) => s + c.durationSeconds, 0);
  const counts = new Map<string, number>();
  for (const c of list) {
    const s = String(c.status ?? "UNKNOWN").toUpperCase();
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  return {
    callsMade: list.length,
    connected: connected.length,
    connectionRate: list.length ? connected.length / list.length : 0,
    dialSeconds: list.reduce((s, c) => s + c.durationSeconds, 0),
    talkSeconds,
    avgCallSeconds: connected.length ? talkSeconds / connected.length : 0,
    dispositions: [...counts.entries()]
      .map(([status, count]) => {
        const type = dispositionTypeOfStatus(status);
        return { status, label: callStatusLabel(status), count, positive: type === null ? null : type === "positive" };
      })
      .sort((a, b) => b.count - a.count),
  };
}

/** "m:ss" or "h:mm:ss", like WAVV's dial/talk time. */
export function clock(seconds: number): string {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}
