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
