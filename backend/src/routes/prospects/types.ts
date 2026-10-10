export interface AgencyProspect {
  id: string;
  name?: string;
  slug?: string;
  phone?: string;
  phoneNumber?: { primaryPhoneNumber?: string; primaryPhoneCountryCode?: string; primaryPhoneCallingCode?: string; additionalPhones?: unknown[] } | string;
  primaryPhone?: { primaryPhoneNumber?: string; primaryPhoneCountryCode?: string; primaryPhoneCallingCode?: string; additionalPhones?: unknown[] } | string;
  phoneValid?: boolean;
  fullAddress?: string;
  city?: string;
  region?: string;
  country?: string;
  niche?: string;
  label?: string | { value?: string; label?: string };
  website?: string;
  rating?: number;
  reviewCount?: number;
  email?: string;
  externalId?: string;
  outboundState?: string | { value?: string; label?: string };
  outboundLabel?: string | { value?: string; label?: string };
  smsMetadata?: unknown;
  videoStatus?: string | { value?: string; label?: string };
  videoSource?: string;
  videoError?: string;
  videoUrl?: { primaryLinkUrl?: string; primaryLinkLabel?: string; secondaryLinks?: unknown[] };
  whatsappStatus?: string | { value?: string; label?: string };
  whatsappValidated?: boolean;
  ghlWebhookUrl?: string;
  googleReviewsUrl?: string;
  coldCallStatus?: string;
  utmSource?: string;
  source?: string;
  /** Free-text contact notes (created by setupProspectSchema; never stored in outboundLabel). */
  notes?: string | null;
  qualificationStatus?: string | { value?: string; label?: string } | null;
  /** WorkspaceMember UUID responsible for the prospect (our attribution, server-derived). */
  createdByMemberId?: string;
  campaignIdId?: string; // Relation to agencyCampaign
  createdAt?: string;
  updatedAt?: string;
}

export interface AgencyCampaign {
  id: string;
  utmSource?: string;
}

export interface IndustryRouting {
  urlKey: string;
  funnelBaseUrl?: string;
  templateBaseUrl?: string;
  packDir?: string;
}
