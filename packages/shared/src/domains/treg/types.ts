export interface TregBusinessRecord {
  externalId: string;
  name: string;
  domain?: string | null;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  country: "AU" | string;
  industry?: string | null;
  websiteUrl?: string | null;
  source?: string | null;
  enrichedAt?: string | null;
}

export interface TwentyProspectPayload {
  name: string;
  company: string;
  city: string;
  country: string;
  phone: string;
  websiteUrl?: string | null;
  label: string;
  leadSource: string;
  lastTregAt: string;
  coldCallStatus: string;
}
