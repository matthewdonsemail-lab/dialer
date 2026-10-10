import type { AgencyCall } from "../types.js";

/** AgencyCall -> frontend shape. Pure. */
export function mapCall(call: AgencyCall) {
  return {
    id: call.id,
    name: call.name || null,
    direction: call.direction || null,
    // `status` stays what every report and badge reads: the operator's
    // disposition when there is one, else the system result.
    status: call.disposition || call.status || null,
    systemStatus: call.status || null,
    disposition: call.disposition || null,
    notes: call.notes || null,
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
    aiSummary: call.aiSummary || null,
    aiSentiment: call.aiSentiment || null,
    aiScore: typeof call.aiScore === "number" ? call.aiScore : null,
    aiKeyPoints: call.aiKeyPoints || null,
    aiScores: call.aiScores || null,
    aiConfidence: typeof call.aiConfidence === "number" ? call.aiConfidence : null,
    aiModel: call.aiModel || null,
    aiAnalyzedAt: call.aiAnalyzedAt || null,
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
