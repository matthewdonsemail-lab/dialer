import type { AgencyCampaign, CampaignListItem } from "../types.js";

/**
 * Maps Twenty's status SELECT values to frontend display values.
 * Twenty stores: ACTIVE, INACTIVE, DRAFT
 * Frontend displays: active, paused, draft (for UI consistency)
 * Pure.
 */
export function mapCampaignStatus(twentyStatus: string | undefined): string {
  if (!twentyStatus) return "draft";
  const upper = twentyStatus.toUpperCase();
  if (upper === "ACTIVE") return "active";
  if (upper === "INACTIVE") return "paused";
  return "draft";
}

/**
 * Maps frontend type/utmSource values back to Twenty's campaignType SELECT values.
 * Frontend sends: outbound, inbound, blended, referral, cold-call, website, twenty-import, other
 * Twenty stores: OUTBOUND, INBOUND, BLENDED, REFERRAL, COLD_CALL, WEBSITE, TWENTY_IMPORT, OTHER
 * Pure.
 */
export function mapCampaignType(frontendType: string | undefined): string {
  if (!frontendType) return "OUTBOUND";
  const map: Record<string, string> = {
    "outbound": "OUTBOUND",
    "inbound": "INBOUND",
    "blended": "BLENDED",
    "referral": "REFERRAL",
    "cold-call": "COLD_CALL",
    "cold_call": "COLD_CALL",
    "website": "WEBSITE",
    "twenty-import": "TWENTY_IMPORT",
    "twenty_import": "TWENTY_IMPORT",
    "other": "OTHER",
  };
  return map[frontendType.toLowerCase()] || "OUTBOUND";
}

/** AgencyCampaign -> frontend list item. Pure. */
export function mapCampaign(campaign: AgencyCampaign): CampaignListItem {
  return {
    id: campaign.id,
    name: campaign.name || "Unnamed Campaign",
    type: campaign.campaignType?.toLowerCase().replace("_", "-") || "outbound",
    status: mapCampaignStatus(campaign.status),
    settings: campaign.note ? JSON.parse(campaign.note) : null,
    created_at: campaign.createdAt || new Date().toISOString(),
    updated_at: campaign.updatedAt || new Date().toISOString(),
  };
}
