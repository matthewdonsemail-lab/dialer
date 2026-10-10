export const CAMPAIGN_STATUSES = ["ACTIVE", "COMPLETED", "ARCHIVED"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export interface CallCampaignRecord {
  id: string;
  name?: string | null;
  status?: string | null;
  contactIds?: string | null;
  createdByMemberId?: string | null;
  ownerName?: string | null;
  createdAt?: string;
}

/** Accepts an array or a JSON string; keeps unique non-empty ids in order. Pure. */
export function parseContactIds(value: unknown): string[] {
  let list: unknown = value;
  if (typeof value === "string") {
    try {
      list = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const id = typeof item === "string" ? item.trim() : "";
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/** Twenty record -> API shape. Unknown statuses read as active. Pure. */
export function mapCampaign(record: CallCampaignRecord) {
  const status = String(record.status ?? "").toUpperCase();
  return {
    id: record.id,
    name: record.name || "Untitled campaign",
    status: (CAMPAIGN_STATUSES.includes(status as CampaignStatus) ? status : "ACTIVE").toLowerCase() as Lowercase<CampaignStatus>,
    contactIds: parseContactIds(record.contactIds),
    createdByName: record.ownerName || null,
    createdAt: record.createdAt || new Date(0).toISOString(),
  };
}
