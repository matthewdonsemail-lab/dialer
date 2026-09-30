export interface NewLeadInfo {
  id: string;
  contactName?: string | null;
  company?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface LeadBroadcastResult {
  attempted: number;
  sent: number;
  skippedNoKey: number;
  failed: number;
}