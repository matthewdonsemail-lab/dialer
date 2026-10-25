import { toAustralianE164 } from "../../outreach/utils/toE164.js";
import type { TregBusinessRecord, TwentyProspectPayload } from "../types.js";

/**
 * Maps a Treg Australian business discovery record into a Twenty CRM agencyProspect payload.
 * Normalizes phone numbers to canonical Australian E.164 (+61...), defaults industry label,
 * and stamps the lastTregAt audit timestamp.
 */
export function mapTregToProspect(record: TregBusinessRecord): TwentyProspectPayload {
  const normalizedPhone = toAustralianE164(record.phone) ?? record.phone ?? "";
  return {
    name: record.name,
    company: record.name,
    city: record.city || "Sydney",
    country: "AU",
    phone: normalizedPhone,
    websiteUrl: record.websiteUrl || (record.domain ? `https://${record.domain}` : null),
    label: record.industry || "AUTO_PAINT_AND_BODY_SHOPS",
    leadSource: "TREG",
    lastTregAt: record.enrichedAt || new Date().toISOString(),
    coldCallStatus: "NEW",
  };
}
