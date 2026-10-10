import type { ContactType } from "@/domains/contact/list";

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
