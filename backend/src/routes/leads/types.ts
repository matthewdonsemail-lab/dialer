export interface AgencyCampaign {
  id: string;
  utmSource?: string;
}

export interface AgencyLead {
  id: string;
  name?: string;
  contactName?: string;
  email?: string;
  phone?: {
    primaryPhoneNumber?: string;
    primaryPhoneCountryCode?: string;
    primaryPhoneCallingCode?: string;
    additionalPhones?: any[];
  };
  company?: string;
  status?: string;
  coldCallStatus?: string;
  source?: string;
  note?: string;
  outboundMessage?: string;
  createdById?: string;
  campaignIdId?: string; // Relation to agencyCampaign
  createdAt?: string;
  updatedAt?: string;
}
