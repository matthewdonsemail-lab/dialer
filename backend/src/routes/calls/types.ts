export interface AgencyCall {
  id: string;
  name?: string;
  direction?: string;
  status?: string;
  fromNumber?: string;
  toNumber?: string;
  startedAt?: string;
  endedAt?: string;
  durationSeconds?: number;
  telnyxCallId?: string;
  telnyxRecordingId?: string;
  recordingUrl?: string;
  transcript?: string;
  transcriptionStatus?: string;
  summary?: string;
  // AI analysis — one row = one call, rating stored on the record itself.
  aiSummary?: string;
  aiSentiment?: string;
  aiScore?: number;
  aiKeyPoints?: string;
  aiScores?: string;
  aiConfidence?: number;
  aiModel?: string;
  aiAnalyzedAt?: string;
  debugLog?: string;
  meetingUrl?: string;
  meetingProvider?: string;
  meetingAt?: string;
  meetingStatus?: string;
  meetingBookingId?: string;
  agencyPhoneId?: string;
  agencyProspectId?: string;
  agencyLeadId?: string;
  createdBy?: unknown;
  createdAt?: string;
  updatedAt?: string;
}
