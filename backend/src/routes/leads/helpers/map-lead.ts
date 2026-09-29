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
export function mapLeadToFrontend(lead: AgencyLead, campaignMap: Record<string, string> = {}) {
  const fullName = lead.name || lead.contactName || "";
  const parts = fullName.split(" ");
  const status = twentyStatusToFrontend(lead);
  return {
    id: lead.id,
    first_name: parts[0] || undefined,
    last_name: parts.slice(1).join(" ") || undefined,
    company: lead.company,
    phone: lead.phone?.primaryPhoneNumber,
    email: lead.email,
    website: undefined,
    address: undefined,
    city: undefined,
    state: undefined,
    zip: undefined,
    status,
    source: lead.source,
    campaign_id: lead.campaignIdId || undefined,
    campaign_type: lead.createdById ? (campaignMap[lead.createdById] || undefined) : undefined,
    assigned_to: lead.createdById,
    tags: null,
    notes: lead.note,
    dnc: status === "not_interested" || status === "converted",
    last_called_at: null,
    call_count: 0,
    sync_id: lead.outboundMessage,
    created_at: lead.createdAt || new Date().toISOString(),
    updated_at: lead.updatedAt || new Date().toISOString(),
  };
}
