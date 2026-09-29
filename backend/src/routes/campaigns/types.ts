export interface AgencyCampaign {
  id: string;
  name?: string;
  status?: string; // From Twenty SELECT: ACTIVE, INACTIVE, DRAFT
  campaignType?: string; // From Twenty SELECT: OUTBOUND, INBOUND, etc.
  note?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CampaignListItem {
  id: string;
  name: string;
  type: string; // frontend display type (outbound, inbound, etc.)
  status: string; // frontend display status (active, paused, draft)
  settings: any;
  created_at: string;
  updated_at: string;
}
