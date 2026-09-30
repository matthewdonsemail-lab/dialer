import { Router } from "express";
import { authMiddleware, AuthRequest } from "../../middleware/auth.js";
import { listTwentyAll, createTwenty, updateTwenty, getTwenty } from "../../lib/twenty/client/index.js";
import { resolveActor } from "../../lib/twenty/actor/index.js";
import { telnyxClient, telnyxErrorMessage } from "../../lib/telnyx/index.js";
import { analyzeCallTranscript, isAiConfigured } from "../../lib/ai/analysis/index.js";
import { createLogger } from "../../lib/logger/index.js";
import type { AgencyCall } from "./types.js";
import { mapCall } from "./helpers/index.js";

const router = Router();
router.use(authMiddleware);

const log = createLogger('calls');

// GET /api/calls — newest first (Twenty returns insertion order; reverse client-side)
router.get("/", async (_req, res) => {
  try {
    const calls = await listTwentyAll<AgencyCall>('agencyCalls');
    res.json(calls.map(mapCall).reverse());
  } catch (err: any) {
    log.error("Failed to fetch calls:", err.message);
    res.status(500).json({ error: "Failed to fetch calls", details: err.message });
  }
});

// GET /api/calls/:id
router.get("/:id", async (req, res) => {
  try {
    const call = await getTwenty<AgencyCall>('agencyCalls', req.params.id as string);
    res.json(mapCall(call));
  } catch (err: any) {
    res.status(404).json({ error: "Call not found" });
  }
});

// GET /api/calls/:id/audio — redirect to a fresh Telnyx mp3.
// Telnyx download URLs expire (~10 min), so playback always re-resolves here.
// The API key never leaves the server.
router.get("/:id/audio", async (req, res) => {
  try {
    const call = await getTwenty<AgencyCall>('agencyCalls', req.params.id as string);
    if (!call.telnyxRecordingId) {
      res.status(404).json({ error: "No Telnyx recording for this call yet" });
      return;
    }
    let tx;
    try {
      tx = telnyxClient();
    } catch (err: any) {
      res.status(500).json({ error: err.message });
      return;
    }
    let retrieved: any;
    try {
      retrieved = await tx.recordings.retrieve(call.telnyxRecordingId);
    } catch (err: any) {
      log.info(`Telnyx recording lookup failed: ${telnyxErrorMessage(err)}`);
      res.status(502).json({ error: "Telnyx recording lookup failed" });
      return;
    }
    const url = retrieved?.data?.download_urls?.mp3 || retrieved?.data?.download_urls?.wav;
    if (!url) {
      res.status(404).json({ error: "Recording has no download URL yet" });
      return;
    }
    res.redirect(url);
  } catch (err: any) {
    log.error("Failed to resolve call audio:", err.message);
    res.status(500).json({ error: "Failed to resolve call audio", details: err.message });
  }
});

// POST /api/calls/:id/record — start Telnyx server-side recording (+transcription)
// for the live call. Plain SIP-trunked calls are NOT auto-recorded; this is
// what creates the recording object that later arrives via call.recording.saved.
router.post("/:id/record", async (req, res) => {
  try {
    const call = await getTwenty<AgencyCall>('agencyCalls', req.params.id as string);
    if (!call.telnyxCallId) {
      res.status(400).json({ error: "Call has no telnyxCallId yet (not answered?)" });
      return;
    }
    let tx;
    try {
      tx = telnyxClient();
    } catch (err: any) {
      res.status(500).json({ error: err.message });
      return;
    }
    let started: any;
    try {
      started = await tx.calls.actions.startRecording(call.telnyxCallId, {
        format: "mp3",
        channels: "dual",
        transcription: true,
      } as any);
    } catch (err: any) {
      log.info(`Telnyx record_start failed: ${telnyxErrorMessage(err)}`);
      res.status(502).json({ error: "Telnyx record_start failed", details: telnyxErrorMessage(err) });
      return;
    }
    const recordingId: string | null =
      started?.data?.recording_id || started?.data?.id || null;
    if (recordingId) {
      try {
        await updateTwenty<AgencyCall>('agencyCalls', call.id, {
          telnyxRecordingId: recordingId,
          transcriptionStatus: "PENDING",
        });
      } catch (err: any) {
        log.info(`Could not stamp telnyxRecordingId: ${err.message}`);
      }
    }
    log.info(`Server recording started: call=${call.id} rec=${recordingId || "?"}`);
    res.json({ ok: true, telnyxRecordingId: recordingId });
  } catch (err: any) {
    log.error("Failed to start server recording:", err.message);
    res.status(500).json({ error: "Failed to start server recording", details: err.message });
  }
});

// POST /api/calls/:id/reconcile — Telnyx-side fallback: when the browser never
// captured a call-control-id, find the call's recording by from/to/connection
// + time window and attach it. Returns { attached: boolean }.
router.post("/:id/reconcile", async (req, res) => {
  try {
    const call = await getTwenty<AgencyCall>('agencyCalls', req.params.id as string);
    if (call.telnyxRecordingId) {
      res.json({ attached: true, already: true });
      return;
    }
    let tx;
    try {
      tx = telnyxClient();
    } catch (err: any) {
      res.status(500).json({ error: err.message });
      return;
    }
    const since = new Date(new Date(call.createdAt || Date.now()).getTime() - 15 * 60_000).toISOString();
    let items: any[] = [];
    try {
      const page: any = await tx.recordings.list({
        filter: {
          ...(call.fromNumber ? { from: call.fromNumber } : {}),
          ...(call.toNumber ? { to: call.toNumber } : {}),
        },
      } as any);
      items = page?.data ?? [];
    } catch (err: any) {
      res.status(502).json({ error: "Telnyx recordings lookup failed", details: telnyxErrorMessage(err) });
      return;
    }
    const match = items.find((rec: any) =>
      rec?.status === "completed" && (!rec?.created_at || rec.created_at >= since)
    );
    if (!match) {
      res.json({ attached: false });
      return;
    }
    const patch: Record<string, unknown> = {
      telnyxRecordingId: match.id,
      transcriptionStatus: "PENDING",
    };
    if (match?.download_urls?.mp3) patch.recordingUrl = match.download_urls.mp3;
    else if (match?.download_urls?.wav) patch.recordingUrl = match.download_urls.wav;
    if (match?.call_control_id) patch.telnyxCallId = match.call_control_id;
    const updated = await updateTwenty<AgencyCall>('agencyCalls', call.id, patch);
    log.info(`Reconciled recording: call=${call.id} rec=${match.id}`);
    res.json({ attached: true, telnyxRecordingId: match.id, call: mapCall(updated) });
  } catch (err: any) {
    log.error("Failed to reconcile recording:", err.message);
    res.status(500).json({ error: "Failed to reconcile recording", details: err.message });
  }
});

// POST /api/calls — log a finished call (recording arrives later via Telnyx webhook)
router.post("/", async (req: AuthRequest, res) => {
  try {
    const {
      direction, status, fromNumber, toNumber, startedAt, endedAt,
      durationSeconds, telnyxCallId, telnyxRecordingId, recordingUrl,
      transcript, transcriptionStatus, summary,
      aiSummary, aiSentiment, aiScore, aiKeyPoints, aiScores, aiConfidence, aiModel, aiAnalyzedAt,
      agencyPhoneId, agencyProspectId, agencyLeadId,
    } = req.body as Partial<AgencyCall>;

    if (!toNumber) {
      res.status(400).json({ error: "toNumber is required" });
      return;
    }

    const payload: Record<string, unknown> = {
      name: `${direction || "OUTBOUND"} ${toNumber} ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
      direction: direction || "OUTBOUND",
      status: status || "COMPLETED",
      fromNumber: fromNumber || "",
      toNumber,
      durationSeconds: durationSeconds ?? 0,
    };
    // Own-field member attribution (queryable UUID next to the system Actor).
    // Omitted for legacy/fallback sessions without a resolved member.
    if (req.workspaceMemberId) payload.createdByMemberId = req.workspaceMemberId;
    if (startedAt) payload.startedAt = startedAt;
    if (endedAt) payload.endedAt = endedAt;
    if (telnyxCallId) payload.telnyxCallId = telnyxCallId;
    if (telnyxRecordingId) payload.telnyxRecordingId = telnyxRecordingId;
    if (recordingUrl) payload.recordingUrl = recordingUrl;
    if (transcript) payload.transcript = transcript;
    if (transcriptionStatus) payload.transcriptionStatus = transcriptionStatus;
    if (summary) payload.summary = summary;
    if (aiSummary) payload.aiSummary = aiSummary;
    if (aiSentiment) payload.aiSentiment = aiSentiment;
    if (typeof aiScore === "number") payload.aiScore = aiScore;
    if (aiKeyPoints) payload.aiKeyPoints = aiKeyPoints;
    if (aiScores) payload.aiScores = aiScores;
    if (typeof aiConfidence === "number") payload.aiConfidence = aiConfidence;
    if (aiModel) payload.aiModel = aiModel;
    if (aiAnalyzedAt) payload.aiAnalyzedAt = aiAnalyzedAt;
    if (agencyPhoneId) payload.agencyPhoneId = agencyPhoneId;
    if (agencyProspectId) payload.agencyProspectId = agencyProspectId;
    if (agencyLeadId) payload.agencyLeadId = agencyLeadId;

    const created = await createTwenty<AgencyCall>('agencyCalls', payload, await resolveActor(req));
    log.info(
      `Call logged: ${created.id} ${payload.direction} ${payload.fromNumber || "?"} -> ${toNumber} ` +
      `status=${payload.status} dur=${payload.durationSeconds}s ` +
      `telnyx=${payload.telnyxCallId || "-"} phone=${payload.agencyPhoneId || "-"} ` +
      `prospect=${payload.agencyProspectId || "-"} lead=${payload.agencyLeadId || "-"}`
    );

    // Point the phone row at its latest call (traceability; claim stays until release)
    if (agencyPhoneId) {
      try {
        await updateTwenty('agencyPhones', agencyPhoneId as string, { currentCallId: created.id });
      } catch (err: any) {
        log.info(`Could not stamp currentCallId: ${err.message}`);
      }
    }

    res.status(201).json(mapCall(created));
  } catch (err: any) {
    log.error("Failed to log call:", err.message);
    res.status(500).json({ error: "Failed to log call", details: err.message });
  }
});

// PATCH /api/calls/:id — enrich (webhook: recordingUrl/transcript/meeting link/AI analysis)
router.patch("/:id", async (req, res) => {
  try {
    const allowed = [
      "status", "endedAt", "durationSeconds", "telnyxCallId", "telnyxRecordingId", "recordingUrl",
      "transcript", "transcriptionStatus", "summary", "debugLog",
      "meetingUrl", "meetingProvider", "meetingAt", "meetingStatus", "meetingBookingId",
      "aiSummary", "aiSentiment", "aiScore", "aiKeyPoints", "aiScores", "aiConfidence", "aiModel", "aiAnalyzedAt",
    ] as const;
    const patch: Record<string, unknown> = {};
    for (const key of allowed) {
      if (req.body?.[key] !== undefined) patch[key] = req.body[key];
    }
    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: "Nothing to update" });
      return;
    }
    const actor = await resolveActor(req);
    const updated = await updateTwenty<AgencyCall>('agencyCalls', req.params.id as string, patch, actor);
    res.json(mapCall(updated));
  } catch (err: any) {
    log.error("Failed to update call:", err.message);
    res.status(500).json({ error: "Failed to update call", details: err.message });
  }
});

// POST /api/calls/:id/analyze — run OpenAI-compatible analysis over the
// stored transcript and write the rating back onto the same call row.
// Manual trigger (UI button) and backfill path; the Telnyx transcription
// webhook also calls this best-effort when a transcript lands.
router.post("/:id/analyze", async (req, res) => {
  try {
    if (!isAiConfigured()) {
      res.status(500).json({ error: "OPENAI_API_KEY not configured" });
      return;
    }
    const call = await getTwenty<AgencyCall>('agencyCalls', req.params.id as string);
    if (!call.transcript || call.transcript.trim().length < 10) {
      res.status(400).json({ error: "Call has no transcript to analyze yet" });
      return;
    }
    let analysis;
    try {
      analysis = await analyzeCallTranscript(call.transcript, {
        direction: call.direction,
        durationSeconds: call.durationSeconds,
      });
    } catch (err: any) {
      log.info(`AI analysis failed for call=${call.id}: ${err.message}`);
      res.status(502).json({ error: "AI analysis failed", details: String(err.message).slice(0, 200) });
      return;
    }
    const patch: Record<string, unknown> = {
      aiSummary: analysis.summary,
      aiSentiment: analysis.sentiment,
      aiScore: analysis.score,
      aiKeyPoints: JSON.stringify(analysis.keyPoints),
      aiScores: JSON.stringify(analysis.scores),
      aiConfidence: analysis.confidence,
      aiModel: analysis.model,
      aiAnalyzedAt: new Date().toISOString(),
      // Keep legacy summary in sync so old UI surfaces still show something.
      summary: analysis.summary,
    };
    const updated = await updateTwenty<AgencyCall>('agencyCalls', call.id, patch, await resolveActor(req));
    log.info(`AI analysis stored: call=${call.id} sentiment=${analysis.sentiment} score=${analysis.score}`);
    res.json({ ok: true, analysis, call: mapCall(updated) });
  } catch (err: any) {
    log.error("Failed to analyze call:", err.message);
    res.status(500).json({ error: "Failed to analyze call", details: err.message });
  }
});

export default router;
