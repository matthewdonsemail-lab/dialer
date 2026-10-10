import type { AgencyProspect } from "../types.js";
import { additionalPhones } from "../../../lib/twenty/contactValues/index.js";
import { selectValue } from "./select-value.js";

// Status mappings. Pure data.
const STATUS_MAP: Record<string, string> = {
  "NEW": "new",
  "CONTACTED": "contacted",
  "INTERESTED": "interested",
  "NOT_INTERESTED": "not_interested",
  "CALLBACK": "callback",
  "CONVERTED": "converted",
  "DO_NOT_CONTACT": "do_not_contact",
};

/** Frontend status + dnc -> Twenty coldCallStatus. Pure. */
export function frontendStatusToTwenty(status: string | undefined, dnc: unknown): string {
  return dnc ? "DO_NOT_CONTACT" : (
    status === "contacted" ? "CONTACTED" :
    status === "interested" ? "INTERESTED" :
    status === "callback" ? "CALLBACK" :
    status === "converted" ? "CONVERTED" :
    status === "not_interested" ? "NOT_INTERESTED" :
    status === "do_not_contact" ? "DO_NOT_CONTACT" : "NEW"
  );
}

/** AgencyProspect -> frontend list shape. Pure. */
export function mapProspectListItem(prospect: AgencyProspect) {
  // Parse name into first_name / last_name
  const fullName = prospect.name || "";
  const nameParts = fullName.split(" ");
  const firstName = nameParts[0] || undefined;
  const lastName = nameParts.slice(1).join(" ") || undefined;

  // Parse address
  const addressParts = (prospect.fullAddress || "").split(",").map(p => p.trim());
  const address = addressParts[0] || "";
  const city = prospect.city || addressParts[1] || "";
  const state = prospect.region || addressParts[2] || "";
  const zip = addressParts[3] || "";

  // Map Twenty status to our frontend status
  const status = prospect.coldCallStatus
    ? STATUS_MAP[prospect.coldCallStatus] || "new"
    : "new";

  const labelValue = selectValue(prospect.label);
  const outboundState = selectValue(prospect.outboundState);

  return {
    id: prospect.id,
    first_name: firstName,
    last_name: lastName,
    company: prospect.niche || "—",
    phone: prospect.phone,
    email: prospect.email,
    additional_phones: additionalPhones(prospect.phoneNumber ?? prospect.primaryPhone, prospect.phone),
    additional_emails: [] as string[],
    website: prospect.website,
    address,
    city,
    state,
    zip,
    status,
    source: prospect.niche || "twenty-import",
    // Industry / niche (live Twenty shape)
    slug: prospect.slug,
    niche: prospect.niche,
    label: labelValue,
    labelValue,
    country: prospect.country,
    rating: prospect.rating,
    reviewCount: prospect.reviewCount,
    // Messaging shape (SMS pipeline + WhatsApp)
    outboundState,
    outboundLabel: selectValue(prospect.outboundLabel),
    smsMetadata: prospect.smsMetadata ?? null,
    phoneValid: prospect.phoneValid ?? null,
    whatsappStatus: selectValue(prospect.whatsappStatus),
    whatsappValidated: prospect.whatsappValidated ?? null,
    phoneNumber: prospect.phoneNumber ?? null,
    primaryPhone: prospect.primaryPhone ?? null,
    ghlWebhookUrl: prospect.ghlWebhookUrl,
    googleReviewsUrl: prospect.googleReviewsUrl,
    // Video pipeline
    videoStatus: selectValue(prospect.videoStatus),
    videoSource: prospect.videoSource,
    videoError: prospect.videoError,
    videoUrl: prospect.videoUrl ?? null,
    campaign_id: prospect.campaignIdId || undefined,
    campaign_type: prospect.utmSource ? (prospect.utmSource === 'outbound' ? 'outbound' : prospect.utmSource === 'inbound' ? 'inbound' : 'blended') : undefined,
    assigned_to: undefined,
    tags: prospect.outboundState ? [prospect.outboundState] : null,
    notes: prospect.notes || undefined,
    qualificationStatus: selectValue(prospect.qualificationStatus) ?? null,
    dnc: status === "not_interested" || status === "do_not_contact",
    last_contacted_at: null,
    contact_count: 0,
    sync_id: prospect.externalId,
    createdByMemberId: prospect.createdByMemberId || null,
    created_at: prospect.createdAt || new Date().toISOString(),
    updated_at: prospect.updatedAt || new Date().toISOString(),
  };
}

/** AgencyProspect -> frontend detail shape. Pure. */
export function mapProspectDetail(prospect: AgencyProspect) {
  const addressParts = (prospect.fullAddress || "").split(",").map(p => p.trim());
  const fullName = prospect.name || "";
  const nameParts = fullName.split(" ");
  const firstName = nameParts[0] || undefined;
  const lastName = nameParts.slice(1).join(" ") || undefined;
  const status = prospect.coldCallStatus
    ? STATUS_MAP[prospect.coldCallStatus] || "new"
    : "new";

  return {
    id: prospect.id,
    first_name: firstName,
    last_name: lastName,
    company: prospect.niche || "—",
    phone: prospect.phone,
    email: prospect.email,
    additional_phones: additionalPhones(prospect.phoneNumber ?? prospect.primaryPhone, prospect.phone),
    additional_emails: [] as string[],
    website: prospect.website,
    address: addressParts[0],
    city: prospect.city || addressParts[1],
    state: prospect.region || addressParts[2],
    zip: addressParts[3],
    status,
    source: prospect.niche || "twenty-import",
    // Industry / niche (live Twenty shape)
    slug: prospect.slug,
    niche: prospect.niche,
    label: selectValue(prospect.label),
    labelValue: selectValue(prospect.label),
    country: prospect.country,
    rating: prospect.rating,
    reviewCount: prospect.reviewCount,
    // Messaging shape (SMS pipeline + WhatsApp)
    outboundState: selectValue(prospect.outboundState),
    outboundLabel: selectValue(prospect.outboundLabel),
    smsMetadata: prospect.smsMetadata ?? null,
    phoneValid: prospect.phoneValid ?? null,
    whatsappStatus: selectValue(prospect.whatsappStatus),
    whatsappValidated: prospect.whatsappValidated ?? null,
    phoneNumber: prospect.phoneNumber ?? null,
    primaryPhone: prospect.primaryPhone ?? null,
    ghlWebhookUrl: prospect.ghlWebhookUrl,
    googleReviewsUrl: prospect.googleReviewsUrl,
    // Video pipeline
    videoStatus: selectValue(prospect.videoStatus),
    videoSource: prospect.videoSource,
    videoError: prospect.videoError,
    videoUrl: prospect.videoUrl ?? null,
    campaign_id: prospect.campaignIdId || undefined,
    campaign_type: prospect.utmSource ? (prospect.utmSource === 'outbound' ? 'outbound' : prospect.utmSource === 'inbound' ? 'inbound' : 'blended') : undefined,
    tags: prospect.outboundState ? [prospect.outboundState] : null,
    notes: prospect.notes ?? null,
    qualificationStatus: selectValue(prospect.qualificationStatus) ?? null,
    dnc: status === "not_interested" || status === "do_not_contact",
    sync_id: prospect.externalId,
    createdByMemberId: prospect.createdByMemberId || null,
    created_at: prospect.createdAt || new Date().toISOString(),
    updated_at: prospect.updatedAt || new Date().toISOString(),
  };
}

/** Updated AgencyProspect -> frontend shape (PATCH response). Pure. */
export function mapProspectUpdateResult(prospect: AgencyProspect) {
  const mappedStatus = prospect.coldCallStatus
    ? STATUS_MAP[prospect.coldCallStatus] || "new"
    : "new";

  const fullName = prospect.name || "";
  const nameParts = fullName.split(" ");

  return {
    id: prospect.id,
    first_name: nameParts[0] || undefined,
    last_name: nameParts.slice(1).join(" ") || undefined,
    company: prospect.niche || "—",
    phone: prospect.phone,
    email: prospect.email,
    website: undefined,
    address: undefined,
    city: undefined,
    state: undefined,
    zip: undefined,
    status: mappedStatus,
    source: prospect.source || undefined,
    campaign_id: prospect.campaignIdId || undefined,
    notes: prospect.notes ?? null,
    dnc: mappedStatus === "not_interested" || mappedStatus === "converted",
    last_called_at: null,
    call_count: 0,
    createdByMemberId: prospect.createdByMemberId || null,
    created_at: prospect.createdAt || new Date().toISOString(),
    updated_at: prospect.updatedAt || new Date().toISOString(),
  };
}
