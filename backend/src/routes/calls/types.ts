export interface AgencyCall {
  id: string;
  name?: string;
  direction?: string;
  /** System result: IN_PROGRESS | COMPLETED | FAILED | NO_ANSWER | BUSY. */
  status?: string;
  /** Operator outcome (DISPOSITION_OPTIONS), or null until one is picked. */
  disposition?: string | null;
  /** Free-text call notes from the dialer dock. */
  notes?: string | null;
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
  /** WorkspaceMember UUID responsible for the call (our attribution, server-derived). */
  createdByMemberId?: string;
  createdBy?: unknown;
  createdAt?: string;
  updatedAt?: string;
}
