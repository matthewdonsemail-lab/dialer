import type { Request } from "express";

export interface CallLogsAuthRequest extends Request {
  user?: { id: string; email: string };
}

export interface CreateCallLogBody {
  lead_id?: string;
  user_id?: string;
  campaign_id?: string;
  direction?: string;
  outcome?: string;
  duration_seconds?: number;
  recording_url?: string;
  transcript?: string;
  notes?: string;
  started_at?: string;
  ended_at?: string;
}
