/**
 * POST /api/telnyx-webhook — Telnyx event receiver (Vercel serverless).
 *
 * Configure on the Telnyx connection as:
 *   https://<vercel-app>/api/telnyx-webhook?token=<TELNYX_WEBHOOK_TOKEN>
 *
 * Env (Vercel project settings, never bundled):
 *   TWENTY_BASE_URL, TWENTY_API_KEY, TELNYX_WEBHOOK_TOKEN
 * Build note: SIP_* vars bake into the SPA at build time (Vite).
 * Rebuild with current project env after any env change.
 *
 * Handled events:
 *   call.recording.saved                -> attach recording to agencyCalls (by telnyxCallId;
 *                                          falls back to newest recording-less from/to row
 *                                          within 2h, for tabs closed before the id stamp)
 *   call.recording.transcription.saved  -> attach transcript to agencyCalls (same fallback)
 *   message.received / message.finalized -> acknowledged (SMS pipeline owns these next)
 * Everything else -> 200 + logged.
 */

type VercelReq = {
  method?: string;
  query?: Record<string, string | string[]>;
  body?: any;
};

type VercelRes = {
  status: (code: number) => VercelRes;
  json: (body: any) => void;
};

const TWENTY_BASE = (process.env.TWENTY_BASE_URL || "https://twenty.inferencesaver.com").replace(/\/$/, "");
const TWENTY_KEY = process.env.TWENTY_API_KEY || "";
const HOOK_TOKEN = process.env.TELNYX_WEBHOOK_TOKEN || "";
// Single AI key (OpenAI-compatible). When set, transcription webhooks also
// write the rating back onto the same agencyCalls row.
const AI_KEY = process.env.OPENAI_API_KEY || "";
const AI_BASE = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
const AI_MODEL = process.env.OPENAI_ANALYSIS_MODEL || "gpt-4o-mini";

const TW_HEADERS: Record<string, string> = {
  Authorization: `Bearer ${TWENTY_KEY}`,
  "Content-Type": "application/json",
  "User-Agent": "dialer-telnyx-webhook",
};

async function twentyRest(method: string, path: string, payload?: any): Promise<any> {
  const res = await fetch(`${TWENTY_BASE}/rest/${path.replace(/^\//, "")}`, {
    method,
    headers: TW_HEADERS,
    body: payload !== undefined ? JSON.stringify(payload) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Twenty ${method} ${path} -> ${res.status} ${text.slice(0, 200)}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

function unwrapList(payload: any, key: string): any[] {
  const data = payload?.data?.data ?? payload?.data;
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data[key])) return data[key];
  for (const v of Object.values(data)) {
    if (Array.isArray(v)) return v as any[];
  }
  return [];
}

function unwrapItem(payload: any): any {
  const data = payload?.data?.data ?? payload?.data ?? payload;
  if (data && typeof data === "object") {
    for (const v of Object.values(data)) {
      if (v && typeof v === "object" && "id" in (v as object)) return v;
    }
    if ("id" in data) return data;
  }
  return data;
}

async function findCallByTelnyxId(telnyxCallId: string): Promise<any | null> {
  // Small table: page it the same way the backend does (id-ordered walk).
  let cursor: string | undefined;
  for (let page = 0; page < 25; page++) {
    const params = new URLSearchParams({
      limit: "200",
      orderBy: "id[AscNullsFirst]",
      ...(cursor ? { filter: `id[gt]:"${cursor}"` } : {}),
    });
    const json = await twentyRest("GET", `agencyCalls?${params.toString()}`);
    const rows = unwrapList(json, "agencyCalls");
    const hit = rows.find((r: any) => r?.telnyxCallId === telnyxCallId);
    if (hit) return hit;
    if (rows.length < 200) break;
    const ids = rows.map((r: any) => r?.id).filter((id: any) => typeof id === "string");
    if (ids.length === 0) break;
    cursor = ids[ids.length - 1];
  }
  return null;
}

/**
 * Orphan-row fallback: the browser row exists but never got its
 * telnyxCallId (tab closed before the stamp). Find the newest recording-less
 * row for the same caller->callee pair, created within the last 2h.
 * Returns null when nothing plausible matches — the caller then falls back
 * to creating an INBOUND row (true inbound calls).
 */
async function findOpenCallByParties(from?: string, to?: string): Promise<any | null> {
  if (!from && !to) return null;
  const windowStart = Date.now() - 120 * 60_000;
  let best: any | null = null;
  let bestAt = 0;
  let cursor: string | undefined;
  for (let page = 0; page < 25; page++) {
    const params = new URLSearchParams({
      limit: "200",
      orderBy: "id[AscNullsFirst]",
      ...(cursor ? { filter: `id[gt]:"${cursor}"` } : {}),
    });
    let rows: any[];
    try {
      const json = await twentyRest("GET", `agencyCalls?${params.toString()}`);
      rows = unwrapList(json, "agencyCalls");
    } catch {
      return best;
    }
    for (const r of rows) {
      if (!r || typeof r !== "object") continue;
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
    if (rows.length < 200) break;
    const ids = rows.map((r: any) => r?.id).filter((id: any) => typeof id === "string");
    if (ids.length === 0) break;
    cursor = ids[ids.length - 1];
  }
  return best;
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
    await twentyRest("PATCH", `agencyCalls/${existing.id}`, patch);
    return `attached to ${existing.id}`;
  }

  // The browser died before stamping telnyxCallId (tab closed mid-call or
  // before wrap-up): match the open row by parties + recency instead of
  // creating a duplicate INBOUND row the agent will never look at. Stamping
  // telnyxCallId here also lets the later transcription event match by id.
  const orphan = await findOpenCallByParties(p?.from, p?.to);
  if (orphan) {
    const patch: Record<string, unknown> = {
      telnyxCallId: callControlId,
      transcriptionStatus: "PENDING",
    };
    if (recordingId) patch.telnyxRecordingId = recordingId;
    if (downloadUrl) patch.recordingUrl = downloadUrl;
    await twentyRest("PATCH", `agencyCalls/${orphan.id}`, patch);
    return `attached to open row ${orphan.id} (parties fallback)`;
  }

  // No browser-logged row (e.g. inbound via shared registration): create one.
  const created = await twentyRest("POST", "agencyCalls", {
    name: `INBOUND ${p?.from ?? "unknown"} ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
    direction: "INBOUND",
    status: "COMPLETED",
    fromNumber: p?.from ?? "",
    toNumber: p?.to ?? "",
    telnyxCallId: callControlId,
    ...(recordingId ? { telnyxRecordingId: recordingId } : {}),
    ...(downloadUrl ? { recordingUrl: downloadUrl } : {}),
    transcriptionStatus: "PENDING",
  });
  return `created ${unwrapItem(created)?.id}`;
}

async function handleTranscriptionSaved(p: any): Promise<string> {
  const callControlId: string | undefined = p?.call_control_id;
  const text: string | undefined =
    p?.transcript ?? p?.transcription_text ?? p?.text ?? p?.transcription?.text;
  if (!callControlId) return "missing call_control_id";
  const existing = await findCallByTelnyxId(callControlId);
  if (!existing) {
    // Same orphan case as recordings: the row never got its telnyxCallId
    // (e.g. the recording event is still in flight). Match by parties so
    // the transcript is not dropped, and stamp the id for later events.
    const orphan = await findOpenCallByParties(p?.from, p?.to);
    if (!orphan) return "no matching call row";
    const patch: Record<string, unknown> = { telnyxCallId: callControlId, transcriptionStatus: "READY" };
    if (text) patch.transcript = text;
    await twentyRest("PATCH", `agencyCalls/${orphan.id}`, patch);
    if (text) await attachAnalysis(orphan.id, text);
    return `transcript attached to open row ${orphan.id} (parties fallback)`;
  }
  const patch: Record<string, unknown> = { transcriptionStatus: "READY" };
  if (text) patch.transcript = text;
  await twentyRest("PATCH", `agencyCalls/${existing.id}`, patch);
  if (text) await attachAnalysis(existing.id, text);
  return `transcript attached to ${existing.id}`;
}

/**
 * Best-effort AI rating on the same row (single OpenAI-compatible key).
 * Never throws — the transcript attach above already succeeded.
 */
async function attachAnalysis(callId: string, transcript: string): Promise<void> {
  if (!AI_KEY || transcript.trim().length < 10) return;
  try {
    const clean = transcript.trim().slice(0, 12_000);
    const res = await fetch(`${AI_BASE}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${AI_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: AI_MODEL,
        temperature: 0.2,
        max_tokens: 600,
        messages: [
          {
            role: "system",
            content: 'You analyze cold-call transcripts. Reply with JSON only: {"summary": string, "sentiment": "POSITIVE"|"NEUTRAL"|"NEGATIVE"|"MIXED", "score": 0-100, "keyPoints": string[], "confidence": 0-1}. Sentiment reflects the PROSPECT.',
          },
          { role: "user", content: `Transcript:\n${clean}` },
        ],
      }),
    });
    if (!res.ok) throw new Error(`AI provider ${res.status}`);
    const json: any = await res.json();
    const content: string = json?.choices?.[0]?.message?.content ?? "{}";
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    const parsed: any = JSON.parse(start >= 0 && end > start ? content.slice(start, end + 1) : content);
    const sentiment = ["POSITIVE", "NEUTRAL", "NEGATIVE", "MIXED"].includes(String(parsed?.sentiment || "").toUpperCase())
      ? String(parsed.sentiment).toUpperCase()
      : "NEUTRAL";
    const summary = String(parsed?.summary || "No summary returned.").slice(0, 1000);
    await twentyRest("PATCH", `agencyCalls/${callId}`, {
      aiSummary: summary,
      aiSentiment: sentiment,
      aiScore: Math.min(100, Math.max(0, Math.round(Number(parsed?.score ?? 50) || 50))),
      aiKeyPoints: JSON.stringify(Array.isArray(parsed?.keyPoints) ? parsed.keyPoints.map(String).slice(0, 5) : []),
      aiConfidence: Math.min(1, Math.max(0, Number(parsed?.confidence ?? 0.5) || 0.5)),
      aiModel: AI_MODEL,
      aiAnalyzedAt: new Date().toISOString(),
      summary,
    });
  } catch (err: any) {
    console.error(`analysis failed for ${callId}:`, err?.message || err);
  }
}

export default async function handler(req: VercelReq, res: VercelRes): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return;
  }

  // Shared-secret gate (we control this token; Telnyx has no per-connection secret here)
  const token = req.query?.token;
  const provided = Array.isArray(token) ? token[0] : token;
  if (!HOOK_TOKEN || provided !== HOOK_TOKEN) {
    res.status(401).json({ error: "bad token" });
    return;
  }
  if (!TWENTY_KEY) {
    res.status(500).json({ error: "receiver not configured" });
    return;
  }

  const body = req.body ?? {};
  const data = body?.data ?? body;
  const eventType: string = data?.event_type ?? data?.record_type ?? "unknown";
  const payload = data?.payload ?? {};

  try {
    let result = "ignored";
    if (eventType === "call.recording.saved") {
      result = await handleRecordingSaved(payload);
    } else if (eventType === "call.recording.transcription.saved") {
      result = await handleTranscriptionSaved(payload);
    } else if (eventType === "call.recording.error") {
      const ccid: string | undefined = payload?.call_control_id;
      if (ccid) {
        const existing = await findCallByTelnyxId(ccid);
        if (existing) await twentyRest("PATCH", `agencyCalls/${existing.id}`, { transcriptionStatus: "FAILED" });
      }
      result = "marked failed";
    } else if (eventType === "message.received" || eventType === "message.finalized") {
      result = "acknowledged (sms pipeline owns next)";
    }
    console.log(`telnyx-webhook ${eventType}: ${result}`);
    res.status(200).json({ ok: true, event: eventType, result });
  } catch (err: any) {
    console.error(`telnyx-webhook ${eventType} failed:`, err?.message || err);
    // 500 so Telnyx retries; the failure is logged with the event type
    res.status(500).json({ ok: false, event: eventType, error: String(err?.message || err).slice(0, 200) });
  }
}
