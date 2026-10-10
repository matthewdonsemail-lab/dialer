import type { CreateCallLogBody } from "../types.js";

/** Frontend create-call-log body -> Twenty agencyCallLogs payload. Pure. */
export function buildCallLogPayload(body: CreateCallLogBody): Record<string, unknown> {
  const {
    lead_id,
    user_id,
    campaign_id,
    direction,
    outcome,
    duration_seconds,
    recording_url,
    transcript,
    notes,
    started_at,
    ended_at,
  } = body;

  const payload: Record<string, unknown> = {
    name: `${direction}: ${outcome}`,
    direction,
    outcome,
    durationSeconds: duration_seconds || 0,
    notes: notes || "",
  };

  if (lead_id) payload.leadId = lead_id;
  if (user_id) payload.userId = user_id;
  if (campaign_id) payload.campaignId = campaign_id;
  if (recording_url) payload.recordingUrl = recording_url;
  if (transcript) payload.transcript = transcript;
  if (started_at) payload.startedAt = started_at;
  if (ended_at) payload.endedAt = ended_at;

  return payload;
}
