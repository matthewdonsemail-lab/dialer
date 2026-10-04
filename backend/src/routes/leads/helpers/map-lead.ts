import type { AgencyLead } from "../types.js";

// Status mappings between Twenty and our frontend
const STATUS_MAP: Record<string, string> = {
  "NEW": "new",
  "CONTACTED": "contacted",
  "QUALIFIED": "interested",
  "BOOKED": "callback",
  "CONVERTED": "converted",
  "LOST": "not_interested",
};

/** Twenty coldCallStatus/status -> frontend status. Pure. */
export function twentyStatusToFrontend(lead: Pick<AgencyLead, "coldCallStatus" | "status">): string {
  return lead.coldCallStatus
    ? STATUS_MAP[lead.coldCallStatus] || "new"
    : (lead.status ? STATUS_MAP[lead.status] || "new" : "new");
}

/**
 * Twenty's PHONES/EMAILS composite fields require structured values and
 * validate them server-side (E.164 for phones, RFC format for emails).
 * The frontend submits E.164 strings (e.g. "+919980511266"); the leading
 * "+" must be preserved or Twenty rejects the number as invalid.
 * Pure.
 */
export function toTwentyPhone(phone: unknown) {
  const raw = String(phone ?? "").trim();
  if (!raw) return undefined;
  const e164 = raw.startsWith("+") ? `+${raw.slice(1).replace(/\D/g, "")}` : raw.replace(/\D/g, "");
  if (!e164 || e164 === "+") return undefined;
  return {
    primaryPhoneNumber: e164,
    primaryPhoneCountryCode: "",
    primaryPhoneCallingCode: "",
    additionalPhones: [],
  };
}

/** Frontend email string -> Twenty EMAILS composite. Pure. */
export function toTwentyEmail(email: unknown) {
  const raw = String(email ?? "").trim();
  if (!raw) return undefined;
  return { primaryEmail: raw, additionalEmails: [] };
}

/** Twenty PHONES composite -> frontend E.164 string. Pure. */
export function fromTwentyPhone(phone: AgencyLead["phone"]): string | undefined {
  if (!phone) return undefined;
  if (typeof phone === "string") return phone || undefined;
  const num = String(phone.primaryPhoneNumber ?? "");
  if (!num) return undefined;
  if (num.startsWith("+")) return num;
  const code = String(phone.primaryPhoneCallingCode ?? "");
  return code ? `${code}${num}` : num;
}

/** Twenty EMAILS composite -> frontend string. Pure. */
export function fromTwentyEmail(email: AgencyLead["email"]): string | undefined {
  if (!email) return undefined;
  if (typeof email === "string") return email || undefined;
  return email.primaryEmail || undefined;
}

/** Frontend status + dnc -> Twenty coldCallStatus. Pure. */
export function frontendStatusToTwenty(status: string | undefined, dnc: unknown): string {
  return dnc ? "DO_NOT_CONTACT" : (
    status === "contacted" ? "CONTACTED" :
    status === "interested" ? "INTERESTED" :
    status === "callback" ? "CALLBACK" :
    status === "converted" ? "CONVERTED" :
    status === "not_interested" ? "NOT_INTERESTED" : "NEW"
  );
}

/** AgencyLead -> frontend lead shape. Pure. */
export function mapLeadToFrontend(lead: AgencyLead, campaignMap: Record<string, string> = {}, callCount = 0) {
  const fullName = lead.name || lead.contactName || "";
  const parts = fullName.split(" ");
  const status = twentyStatusToFrontend(lead);
  return {
    id: lead.id,
    first_name: parts[0] || undefined,
    last_name: parts.slice(1).join(" ") || undefined,
    company: lead.company,
    phone: fromTwentyPhone(lead.phone),
    email: fromTwentyEmail(lead.email),
    website: undefined,
    address: undefined,
    city: undefined,
    state: undefined,
    zip: undefined,
    status,
    source: lead.source,
    campaign_id: lead.campaignIdId || undefined,
    campaign_type: lead.campaignIdId ? (campaignMap[lead.campaignIdId] || undefined) : undefined,
    assigned_to: lead.createdById,
    tags: null,
    notes: lead.note,
    dnc: status === "not_interested" || status === "converted",
    last_called_at: null,
    call_count: callCount,
    sync_id: lead.outboundMessage,
    created_at: lead.createdAt || new Date().toISOString(),
    updated_at: lead.updatedAt || new Date().toISOString(),
  };
}
