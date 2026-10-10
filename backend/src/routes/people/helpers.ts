import { toTwentyEmail, toTwentyPhone } from "../leads/helpers/mapLead.js";

/** agencyPerson as Twenty returns it. */
export interface AgencyPersonRecord {
  id: string;
  name?: string | null;
  jobTitle?: string | null;
  personRole?: string | null;
  city?: string | null;
  avatarUrl?: string | null;
  phones?: { primaryPhoneNumber?: string; primaryPhoneCallingCode?: string; additionalPhones?: unknown[] } | null;
  emails?: { primaryEmail?: string; additionalEmails?: unknown[] } | null;
  linkedinLink?: { primaryLinkUrl?: string } | null;
  xLink?: { primaryLinkUrl?: string } | null;
  prospectId?: string | null;
  createdAt?: string;
}

export interface Person {
  id: string;
  name: string;
  jobTitle: string | null;
  role: string | null;
  city: string | null;
  avatarUrl: string | null;
  phone: string | null;
  email: string | null;
  linkedin: string | null;
  x: string | null;
  prospectId: string | null;
  createdAt: string | null;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Twenty PHONES -> E.164. The calling code may be stored with or without "+". Pure. */
export function phoneText(p: AgencyPersonRecord["phones"]): string | null {
  const num = String(p?.primaryPhoneNumber ?? "").trim();
  if (!num) return null;
  if (num.startsWith("+")) return num;
  const code = String(p?.primaryPhoneCallingCode ?? "").replace(/\D/g, "");
  return code ? `+${code}${num.replace(/\D/g, "")}` : num;
}

function linkUrl(l?: { primaryLinkUrl?: string } | null): string | null {
  const url = l?.primaryLinkUrl?.trim();
  if (!url) return null;
  return /^https?:/i.test(url) ? url : `https://${url}`;
}

function textOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function mapPerson(r: AgencyPersonRecord): Person {
  return {
    id: r.id,
    name: textOrNull(r.name) ?? "Unnamed person",
    jobTitle: textOrNull(r.jobTitle),
    role: textOrNull(r.personRole),
    city: textOrNull(r.city),
    avatarUrl: textOrNull(r.avatarUrl),
    phone: phoneText(r.phones),
    email: textOrNull(r.emails?.primaryEmail),
    linkedin: linkUrl(r.linkedinLink),
    x: linkUrl(r.xLink),
    prospectId: r.prospectId ?? null,
    createdAt: r.createdAt ?? null,
  };
}

const EMPTY_PHONES = { primaryPhoneNumber: "", primaryPhoneCountryCode: "", primaryPhoneCallingCode: "", additionalPhones: [] };
const EMPTY_EMAILS = { primaryEmail: "", additionalEmails: [] };

/** Request body -> Twenty payload. Only fields present in the body are written. Pure. */
export function personPayload(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const str = (v: unknown) => String(v ?? "").trim();
  if (body.name !== undefined) out.name = str(body.name);
  if (body.jobTitle !== undefined) out.jobTitle = str(body.jobTitle);
  if (body.role !== undefined) out.personRole = str(body.role);
  if (body.city !== undefined) out.city = str(body.city);
  if (body.phone !== undefined) out.phones = toTwentyPhone(body.phone) ?? EMPTY_PHONES;
  if (body.email !== undefined) out.emails = toTwentyEmail(body.email) ?? EMPTY_EMAILS;
  if (body.linkedin !== undefined) out.linkedinLink = { primaryLinkUrl: str(body.linkedin), primaryLinkLabel: "", secondaryLinks: [] };
  return out;
}
