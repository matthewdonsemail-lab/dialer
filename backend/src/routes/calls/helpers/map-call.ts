import type { AgencyCall } from "../types.js";

/** AgencyCall -> frontend shape. Pure. */
export function mapCall(call: AgencyCall) {
  return {
    id: call.id,
    name: call.name || null,
    direction: call.direction || null,
    status: call.status || null,
    fromNumber: call.fromNumber || null,
    toNumber: call.toNumber || null,
    startedAt: call.startedAt || null,
    endedAt: call.endedAt || null,
    durationSeconds: call.durationSeconds ?? 0,
    telnyxCallId: call.telnyxCallId || null,
    telnyxRecordingId: call.telnyxRecordingId || null,
    recordingUrl: call.recordingUrl || null,
    transcript: call.transcript || null,
    transcriptionStatus: call.transcriptionStatus || null,
    summary: call.summary || null,
    debugLog: call.debugLog || null,
    meetingUrl: call.meetingUrl || null,
    meetingProvider: call.meetingProvider || null,
    meetingAt: call.meetingAt || null,
    meetingStatus: call.meetingStatus || null,
    meetingBookingId: call.meetingBookingId || null,
    agencyPhoneId: call.agencyPhoneId || null,
    agencyProspectId: call.agencyProspectId || null,
    agencyLeadId: call.agencyLeadId || null,
    createdByMemberId: call.createdByMemberId || null,
    createdBy: call.createdBy ?? null,
    created_at: call.createdAt || new Date().toISOString(),
    updated_at: call.updatedAt || new Date().toISOString(),
  };
}
