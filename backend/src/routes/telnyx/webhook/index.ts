import { Router } from "express";
import { callResultMachine } from "@dialer/shared";
import { listTwenty, createTwenty, updateTwenty } from "../../../lib/twenty/client/index.js";
import { analyzeCallTranscript, isAiConfigured } from "../../../lib/ai/analysis/index.js";
import { createLogger } from "../../../lib/logger/index.js";
import type { AgencyCall } from "../../calls/types.js";
import { handleBridgeEvent } from "../../../lib/audioBridge/index.js";
import { bridgeConfig, bridgeDeps } from "../../../lib/audioBridge/telnyx.js";

const log = createLogger('telnyx-webhook');

/**
 * POST /api/webhooks/telnyx?token=<TELNYX_WEBHOOK_TOKEN>
 *
 * Telnyx event receiver for the Express backend (local dev AND production
 * via vercel.json /api -> backend service). Parity with the Vercel
 * serverless receiver in frontend/api/telnyx-webhook.ts: same events, same
 * Twenty writes, plus best-effort AI analysis when a transcript lands.
 *
 * Handled events:
 *   call.initiated / call.answered / call.gather.ended / call.hangup
 *                                      -> phone audio sessions (lib/audioBridge)
 *   call.recording.saved               -> attach recording to agencyCalls (by telnyxCallId)
 *   call.recording.transcription.saved -> attach transcript, then AI-analyze
 *   call.recording.error               -> transcriptionStatus=FAILED
 * Everything else -> 200 + logged (Telnyx retries 500s, so only fail on real errors).
 *
 * Configure on the Telnyx connection as:
 *   https://<backend-public-url>/api/webhooks/telnyx?token=<TELNYX_WEBHOOK_TOKEN>
 * For local dev, expose the backend (e.g. ngrok http 4000) and use that URL.
 */

const router = Router();

/** A value safe inside a quoted Twenty REST filter literal. */
function filterLiteral(value: string): string {
  return `"${value.replace(/["\\[\]]/g, "")}"`;
}

/** The call row for a Telnyx call, looked up by filter (not a scan of every call). */
async function findCallByTelnyxId(telnyxCallId: string): Promise<AgencyCall | null> {
  const calls = await listTwenty<AgencyCall>('agencyCalls', { limit: 1, filter: `telnyxCallId[eq]:${filterLiteral(telnyxCallId)}` });
  return calls[0] ?? null;
}

/**
 * Orphan-row fallback (parity with frontend/api/telnyx-webhook.ts): the
 * browser row exists but never got its telnyxCallId (tab closed before the
 * stamp). Find the newest recording-less row for the same pair, <2h old.
 */
async function findOpenCallByParties(from?: string, to?: string): Promise<AgencyCall | null> {
  if (!from && !to) return null;
  const windowStart = Date.now() - 120 * 60_000;
  // Only the last two hours of calls, filtered in Twenty.
  const calls = await listTwenty<AgencyCall>('agencyCalls', {
    limit: 200,
    filter: `createdAt[gte]:"${new Date(windowStart).toISOString()}"`,
  });
  let best: AgencyCall | null = null;
  let bestAt = 0;
  for (const r of calls) {
    if (r.telnyxRecordingId || r.recordingUrl) continue;
    if (from && r.fromNumber && r.fromNumber !== from) continue;
    if (to && r.toNumber && r.toNumber !== to) continue;
    const at = r.createdAt ? new Date(r.createdAt).getTime() : 0;
    if (!Number.isFinite(at) || at < windowStart) continue;
    if (at > bestAt) {
      best = r;
      bestAt = at;
    }
  }
  return best;
}

async function maybeAnalyze(callId: string, transcript: string, call: AgencyCall): Promise<void> {
  if (!isAiConfigured()) {
    // Logged, not silent: a missing OPENAI_API_KEY used to return here with no
    // trace, so an unconfigured deployment looked identical to one where
    // analysis simply had not run yet.
    log.warn(
      `AI analysis skipped for call=${callId}: OPENAI_API_KEY not configured - ai* fields left unset`,
    );
    return;
  }
  try {
    const analysis = await analyzeCallTranscript(transcript, {
      direction: call.direction,
      durationSeconds: call.durationSeconds,
    });
    await updateTwenty<AgencyCall>('agencyCalls', callId, {
      aiSummary: analysis.summary,
      aiSentiment: analysis.sentiment,
      aiScore: analysis.score,
      aiKeyPoints: JSON.stringify(analysis.keyPoints),
      aiScores: JSON.stringify(analysis.scores),
      aiConfidence: analysis.confidence,
      aiModel: analysis.model,
      aiAnalyzedAt: new Date().toISOString(),
      summary: analysis.summary,
    });
    log.info(`AI analysis stored via webhook: call=${callId} score=${analysis.score}`);
  } catch (err: any) {
    log.info(`Webhook AI analysis skipped for call=${callId}: ${err.message}`);
  }
}

async function handleRecordingSaved(p: any): Promise<string> {
  const callControlId: string | undefined = p?.call_control_id;
  const recordingId: string | undefined = p?.recording_id ?? p?.recording_ids?.[0];
  const urls = p?.recording_urls ?? {};
  const downloadUrl: string | undefined = urls.mp3 ?? urls.wav;
  if (!callControlId) return "missing call_control_id";

  const existing = await findCallByTelnyxId(callControlId);
  if (existing) {
    const patch: Record<string, unknown> = { transcriptionStatus: "PENDING" };
    if (recordingId) patch.telnyxRecordingId = recordingId;
    if (downloadUrl) patch.recordingUrl = downloadUrl;
    await updateTwenty<AgencyCall>('agencyCalls', existing.id, patch);
    return `attached to ${existing.id}`;
  }

  // Browser died before stamping telnyxCallId: match the open row by
  // parties + recency instead of a duplicate the agent never looks at.
  const orphan = await findOpenCallByParties(p?.from, p?.to);
  if (orphan) {
    const patch: Record<string, unknown> = {
      telnyxCallId: callControlId,
      transcriptionStatus: "PENDING",
    };
    if (recordingId) patch.telnyxRecordingId = recordingId;
    if (downloadUrl) patch.recordingUrl = downloadUrl;
    await updateTwenty<AgencyCall>('agencyCalls', orphan.id, patch);
    return `attached to open row ${orphan.id} (parties fallback)`;
  }

  const created = await createTwenty<AgencyCall>('agencyCalls', {
    name: `INBOUND ${p?.from ?? "unknown"} ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
    direction: "INBOUND",
    status: callResultMachine.state("COMPLETED"),
    fromNumber: p?.from ?? "",
    toNumber: p?.to ?? "",
    telnyxCallId: callControlId,
    ...(recordingId ? { telnyxRecordingId: recordingId } : {}),
    ...(downloadUrl ? { recordingUrl: downloadUrl } : {}),
    transcriptionStatus: "PENDING",
  });
  return `created ${created.id}`;
}

async function handleTranscriptionSaved(p: any): Promise<string> {
  const callControlId: string | undefined = p?.call_control_id;
  const text: string | undefined =
    p?.transcript ?? p?.transcription_text ?? p?.text ?? p?.transcription?.text;
  if (!callControlId) return "missing call_control_id";
  const existing = await findCallByTelnyxId(callControlId);
  if (!existing) {
    const orphan = await findOpenCallByParties(p?.from, p?.to);
    if (!orphan) return "no matching call row";
    const patch: Record<string, unknown> = { telnyxCallId: callControlId, transcriptionStatus: "READY" };
    if (text) patch.transcript = text;
    await updateTwenty<AgencyCall>('agencyCalls', orphan.id, patch);
    if (text) void maybeAnalyze(orphan.id, text, orphan);
    return `transcript attached to open row ${orphan.id} (parties fallback)`;
  }
  const patch: Record<string, unknown> = { transcriptionStatus: "READY" };
  if (text) patch.transcript = text;
  await updateTwenty<AgencyCall>('agencyCalls', existing.id, patch);
  if (text) void maybeAnalyze(existing.id, text, existing);
  return `transcript attached to ${existing.id}`;
}

// "/" as well as "/telnyx": the router is also mounted at the legacy
// /api/telnyx-webhook path, where the event POST lands on the mount root.
router.post(["/telnyx", "/"], async (req, res) => {
  const expected = process.env.TELNYX_WEBHOOK_TOKEN || "";
  const provided = typeof req.query.token === "string" ? req.query.token : "";
  if (!expected || provided !== expected) {
    res.status(401).json({ error: "bad token" });
    return;
  }

  const body = req.body ?? {};
  const data = body?.data ?? body;
  const eventType: string = data?.event_type ?? data?.record_type ?? "unknown";
  const payload = data?.payload ?? {};

  try {
    let result = "ignored";
    // Phone audio (Call me / Dial in) call-control events, when configured.
    const bridged = bridgeConfig().appId ? await handleBridgeEvent(eventType, payload, bridgeDeps()) : null;
    if (bridged) {
      result = bridged;
    } else if (eventType === "call.recording.saved") {
      result = await handleRecordingSaved(payload);
    } else if (eventType === "call.recording.transcription.saved") {
      result = await handleTranscriptionSaved(payload);
    } else if (eventType === "call.recording.error") {
      const ccid: string | undefined = payload?.call_control_id;
      if (ccid) {
        const existing = await findCallByTelnyxId(ccid);
        if (existing) await updateTwenty<AgencyCall>('agencyCalls', existing.id, { transcriptionStatus: "FAILED" });
      }
      result = "marked failed";
    }
    log.info(`telnyx-webhook ${eventType}: ${result}`);
    res.status(200).json({ ok: true, event: eventType, result });
  } catch (err: any) {
    log.error(`telnyx-webhook ${eventType} failed: ${err.message}`);
    res.status(500).json({ ok: false, event: eventType, error: String(err?.message || err).slice(0, 200) });
  }
});

export default router;
