export interface AgencyScript {
  id: string;
  name?: string;
  campaignIdId?: string; // The relation ID to agencyCampaign (Twenty uses {field}Id pattern)
  scriptData?: string; // JSON string containing script content
  createdAt?: string;
  updatedAt?: string;
}

export interface ScriptListItem {
  id: string;
  name: string;
  campaignId: string | null;
  scriptData: any;
  created_at: string;
  updated_at: string;
}
