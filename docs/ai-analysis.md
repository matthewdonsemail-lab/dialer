# AI call analysis

One row = one call. The transcript, summary, and rating all live on the
`agencyCalls` record itself (`docs/diagrams/data-model.mmd`), so the Rating
column, the call detail page, and Twenty CRM show the same values.

## State machine

`transcriptionStatus`: `NONE` -> `PENDING` (recording saved) -> `READY`
(transcript attached) or `FAILED` (recording/transcription error).

Analysis runs only from `READY` with a transcript >= 10 chars:

- automatic: `call.recording.transcription.saved` webhook triggers
  best-effort analysis (failures are logged, webhook still 200s).
- manual: `POST /api/calls/:id/analyze` (detail page "Analyze this call",
  backfills).

Analysis writes `aiSummary`, `aiSentiment` (`POSITIVE`/`NEUTRAL`/`NEGATIVE`/
`MIXED`, the prospect's feeling), `aiScore` (0-100, how the call went),
`aiKeyPoints` (JSON string array, max 5), `aiConfidence` (0-1), `aiModel`,
`aiAnalyzedAt`, and mirrors `aiSummary` into legacy `summary` so old UI
surfaces keep working.

## Single key

One OpenAI-compatible key drives everything (`backend/src/lib/ai-analysis.ts`,
fetch-based, no vendor SDK):

- `OPENAI_API_KEY` — required for analysis; without it webhooks still attach
  transcripts but skip analysis, and `/analyze` 500s with a clear message.
- `OPENAI_BASE_URL` — default `https://api.openai.com/v1`; any compatible
  gateway works.
- `OPENAI_ANALYSIS_MODEL` — default `gpt-4o-mini`.

Validation: score clamped 0-100 (rounded), sentiment normalized to the enum
(unknown -> `NEUTRAL`), confidence clamped 0-1, transcript truncated to
12k chars, model output parsed as JSON with code-fence tolerance.

## Webhook parity (local = production)

- Express: `POST /api/webhooks/telnyx?token=<TELNYX_WEBHOOK_TOKEN>`
  (`backend/src/routes/webhooks/index.ts`), mounted in `backend/src/index.ts`.
  Same contract as the serverless receiver: token-gated (401 on mismatch),
  200 on unknown events, 500 only on real errors so Telnyx retries.
- Vercel: `POST /api/telnyx-webhook?token=` (`frontend/api/telnyx-webhook.ts`)
  with identical recording/transcription/analysis writes.
- Both share the orphan fallback: when the browser row never got its
  `telnyxCallId`, match the newest recording-less row for the same
  from/to pair within 2h and stamp the id.

Telnyx connection webhook URL (local dev via tunnel, e.g. ngrok):

```text
https://<backend-public-url>/api/webhooks/telnyx?token=<TELNYX_WEBHOOK_TOKEN>
```

## Single agency number

All dialing derives from `GET /api/twenty/phones/primary`
(`backend/src/routes/twenty/phones/index.ts`): `AGENCY_PHONE_NUMBER` env
match first, else first `ACTIVE`/`IDLE` row, else first row. Claim ownership
still guards it (409 when actively held, stale reap after
`CLAIM_STALE_AFTER_MINUTES`, default 60). Holders are never masked as free.

## Schema provisioning

`POST /api/setup/twenty` provisions the AI fields through
`backend/src/lib/twenty-call-history-setup.ts` (idempotent): `aiSummary`,
`aiSentiment`, `aiKeyPoints`, `aiModel` (TEXT), `aiAnalyzedAt` (DATE_TIME),
`aiScore`, `aiConfidence` (NUMBER). Re-run setup after deploying to add
them to an existing workspace.
