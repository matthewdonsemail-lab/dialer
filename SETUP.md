# dialer Setup Guide

## Quick start

```bash
./scripts/setup.sh            # install, create .env.local files, check the Twenty schema
./scripts/setup.sh --apply    # ...and create whatever the schema is missing
./scripts/setup.sh --seed     # ...and load the demo workspace (fresh workspaces only)
bun run dev                   # backend on :4000, frontend on :5173
```

Or the same steps by hand: `bun run install:all`, copy `.env.example` to
`.env.local` and `frontend/.env.example` to `frontend/.env.local`, then
`bun run twenty:schema` and optionally `bun run twenty:seed`.

## Authentication

Twenty is the identity provider. Sign in with your Twenty account through
OAuth with PKCE ([docs/identity.md](docs/identity.md)); the dialer keeps no
users or passwords of its own, and signup is disabled.

## Data

There is no database. Every record is a custom object in your Twenty
workspace, created by `bun run twenty:schema` from
[backend/src/lib/twenty/schema/manifest.ts](backend/src/lib/twenty/schema/manifest.ts):
`agencyProspect`, `agencyLead`, `agencyCampaign`, `agencyScript`,
`agencyPhone`, `agencyCall`, `agencyPerson`, `agencyOffer`, `callCampaign`
and `dialerAudioSession`. The command only adds what is missing;
`bun run twenty:schema:check` is the dry run.

`bun run twenty:seed` loads the demo workspace the screenshots show (24
fictional businesses, 48 calls, scripts, numbers, dial lists). It refuses to
write to a workspace that already has real prospects unless you pass
`-- --force`, and `bun run twenty:seed -- --reset` removes it.

## Environment Variables

### Backend (.env.local at the repo root)
```bash
TWENTY_BASE_URL=https://twenty.example.com
TWENTY_API_KEY=<your-key>
SYNC_POLL_INTERVAL_MS=30000
PORT=4000
JWT_SECRET=<secret>

# Identity — Twenty OAuth (see docs/identity.md; the client is public PKCE-only)
TWENTY_OAUTH_CLIENT_ID=<registered-client-id>
TWENTY_OAUTH_CLIENT_SECRET=
TWENTY_OAUTH_REDIRECT_URI=http://localhost:5173/callback
TWENTY_OAUTH_SCOPE=api profile

# Only needed because this instance is behind an auth-guard nginx with basic auth:
TWENTY_BASIC_USER=
TWENTY_BASIC_PASSWORD=

# Voice + AI analysis (see docs/ai-analysis.md)
TELNYX_API_KEY=<your-key>
TELNYX_MESSAGING_PROFILE_ID=
# Shared secret for the Telnyx webhook (?token=).
#
# Set this on the Telnyx Call Control application's "Webhook Event URL" to the
# CANONICAL receiver for the environment the dialer is served from:
#
#   production (Vercel, root dir = frontend)  /api/telnyx-webhook?token=<value>
#   local dev (Express on :4000)              /api/webhooks/telnyx?token=<value>
#
# The Vercel app is a Vite SPA with one serverless function
# (frontend/api/telnyx-webhook.ts). Any other /api/* path there returns the SPA
# index.html, so a webhook pointed at the Express path silently receives HTML
# and Telnyx gives up after its retries -- call rows keep their recording id and
# transcriptionStatus=PENDING forever, with no transcript. Verify after any
# change (a correct token answers 200 {"ok":true,...}; HTML or 405 means the
# URL is wrong):
#
#   curl -X POST "https://<vercel-app>/api/telnyx-webhook?token=<value>" \
#     -H 'content-type: application/json' -d '{"data":{"event_type":"ping"}}'
TELNYX_WEBHOOK_TOKEN=
# Single canonical agency number (E.164). Empty = first ACTIVE row.
AGENCY_PHONE_NUMBER=
# Stale claim reap (minutes); default 60.
CLAIM_STALE_AFTER_MINUTES=60
# Single OpenAI-compatible key for call ratings (any base URL works).
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_ANALYSIS_MODEL=gpt-4o-mini
```

### Frontend (frontend/.env.local)
```bash
VITE_API_URL=                      # empty = same origin, proxied to :4000 in dev
VITE_SIP_PROVIDER=telnyx
VITE_SIP_URI=sip:your-username@sip.telnyx.com
VITE_SIP_PASSWORD=
VITE_SIP_WS_URL=wss://sip.telnyx.com:7443
VITE_SIP_CALLER_ID=+15551234567
```

## Where each environment actually runs

The Vercel project has **Root Directory = `frontend`**. That single fact decides
what is live:

| Piece | Production | Local dev |
|---|---|---|
| SPA (`frontend/`) | Vercel static build | `vite` on :5173, `/api` proxied to :4000 |
| Telnyx webhook | `frontend/api/telnyx-webhook.ts` → `/api/telnyx-webhook` | Express → `/api/webhooks/telnyx` on :4000 |
| Everything else under `/api/*` | **not deployed** | Express on :4000 |

Consequences worth knowing before you point anything at the deployed app:

- The root `vercel.json` (`services` + `/api/* -> backend service`) is **outside
  the project root directory and therefore ignored**. Do not expect
  `/api/health`, `/api/calls/*`, or `/api/prospects/*` on the deployed host --
  they answer with the SPA `index.html`. If you need the Express API in
  production, set the Vercel Root Directory to the repo root (which activates
  `services`) and redeploy.
- Recording playback in the SPA uses `/api/calls/:id/audio` whenever a call row
  has a `telnyxRecordingId`, which that route only exists for in the Express
  backend. On the Vercel deployment those rows need a durable `recordingUrl`
  (e.g. object storage) to be playable; Telnyx's own `recording_urls` are signed
  links that expire in minutes and must not be relied on as stored values.
