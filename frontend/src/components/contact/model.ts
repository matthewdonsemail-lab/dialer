import type { ContactType } from "@/lib/contacts";

/**
 * One shape for the contact workspace, whether the record is a prospect
 * (agencyProspect) or a lead (agencyLead). Fields a type does not have are
 * null; `editable` says which ones its PATCH route accepts.
 */
export interface Contact {
  type: ContactType;
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  company: string | null;
  phone: string | null;
  extraPhones: string[];
  email: string | null;
  extraEmails: string[];
  website: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  status: string | null;
  qualification: string | null;
  niche: string | null;
  label: string | null;
  source: string | null;
  rating: number | null;
  reviewCount: number | null;
  outboundState: string | null;
  outboundLabel: string | null;
  videoStatus: string | null;
  whatsappStatus: string | null;
  googleReviewsUrl: string | null;
  campaignId: string | null;
  notes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x) : []);

export function toContact(raw: any, type: ContactType): Contact {
  const firstName = str(raw?.first_name) ?? "";
  const lastName = str(raw?.last_name) ?? "";
  const name = `${firstName} ${lastName}`.trim() || str(raw?.company) || str(raw?.phone) || "Unknown contact";
  return {
    type,
    id: String(raw?.id ?? ""),
    firstName,
    lastName,
    name,
    company: str(raw?.company),
    phone: str(raw?.phone),
    extraPhones: list(raw?.additional_phones),
    email: str(raw?.email),
    extraEmails: list(raw?.additional_emails),
    website: str(raw?.website),
    address: str(raw?.address),
    city: str(raw?.city),
    state: str(raw?.state),
    zip: str(raw?.zip),
    country: str(raw?.country),
    status: str(raw?.status),
    qualification: str(raw?.qualificationStatus),
    niche: str(raw?.niche),
    label: str(raw?.label),
    source: str(raw?.source),
    rating: num(raw?.rating),
    reviewCount: num(raw?.reviewCount),
    outboundState: str(raw?.outboundState),
    outboundLabel: str(raw?.outboundLabel),
    videoStatus: str(raw?.videoStatus),
    whatsappStatus: str(raw?.whatsappStatus),
    googleReviewsUrl: str(raw?.googleReviewsUrl),
    campaignId: str(raw?.campaign_id),
    notes: typeof raw?.notes === "string" ? raw.notes : null,
    createdAt: str(raw?.created_at),
    updatedAt: str(raw?.updated_at),
  };
}

/** Initials for the avatar; a phone glyph is used when the name is a number. */
export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?"
  );
}
