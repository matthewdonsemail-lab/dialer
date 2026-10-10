---
title: "OAuth migration notes: what changed, what broke, and how it was proven"
tags: [auth, oauth, twenty, migration]
status: active
created: 2026-09-29
---

# OAuth migration notes

The working record for removing the dialer's password login and putting it
on Twenty OAuth PKCE. Read [identity.md](./identity.md) for the product
behavior; this file is the audit trail: what was deleted, what was added,
what kept breaking during bring-up, and how each of those was resolved.

## What was deleted

| Thing | Where | Why it's gone |
|---|---|---|
| `pg`, `bcryptjs`, `drizzle-orm` (+ `drizzle.config.ts`, `db/schema.ts`, `db/twenty-pg.ts`) | `backend/` | The old login verified password hashes against **Twenty's own Postgres** over an outbound SSH tunnel. With Twenty as the identity provider, the dialer backend no longer needs a data path into anyone's database — not even to check a hash. |
| Email/password sign-in route | `backend/src/routes/auth/` | Only `GET /api/auth/me` (reads the minted dialer JWT) and a disabled `POST /api/auth/signup` (returns 403: "create the member in Twenty, then sign in with Twenty SSO") remain. |
| Old `frontend/src/lib/auth.ts` password logic | `frontend/` | Replaced by `frontend/src/lib/oauth.ts`. |

## What was added

Backend (`/api/oauth` — a Hono sub-app inside the existing Express server,
mounted via `getRequestListener`; Express keeps every other route):

- `GET  /config`   — public discovery: authorize endpoint, client id, redirect URI, scope. The SPA builds its `/authorize` URL from this; it never hardcodes endpoint paths.
- `POST /token`    — server-side code exchange (code + PKCE verifier). The browser never talks to the issuer's token endpoint directly, so Twenty's CORS posture is irrelevant and no client secret exists.
- `GET  /me`       — introspects a presented Bearer token (`active`, `username`, `scope`); 401 when not live.
- `POST /session`  — introspects the live token, then mints a 7-day dialer JWT (`middleware/auth.ts`, `expiresIn: "7d"`). This is the bridge that keeps every existing `authMiddleware` route untouched.
- `POST /refresh`  — server-side token refresh. **Present, but the SPA does not call it yet** — see "Known open items".

Provider plumbing (`backend/src/lib/twenty/oauth/`):

- `helpers/provider.ts` — Twenty OAuth provider: `/.well-known/...` discovery, code exchange, refresh, introspection, plus RFC 7591 dynamic **client** registration (how the client id in `.env` was created: it's a public PKCE client, no secret).
- `helpers/config.ts` — loads `TWENTY_OAUTH_*` + the `TWENTY_BASIC_USER`/`TWENTY_BASIC_PASSWORD` gate credentials from the **root** `.env.local`.
- `client.ts` — the load-bearing piece for this deployment: `basicAuthFetch()`. Because the instance sits behind an auth-guard nginx, every provider call (discovery, token, introspection, refresh) replays `Authorization: Basic <user>:<pass>` from those two env vars. When `basicAuth` is unset the plain `fetch` is used, so the same code runs against an unguarded upstream.

Frontend:

- `frontend/src/lib/oauth.ts` — `beginSignIn()` (PKCE state + verifier into `sessionStorage`, redirect to `/authorize`) and `finishSignIn()` (state check → `/token` → `/session` → store dialer JWT → caller navigates to `/dashboard`).
- `frontend/src/domains/auth/callback/callbackPage.tsx` — the `/callback` route that drives `finishSignIn` and then bounces to `/dashboard`.
- `frontend/src/domains/auth/login/loginPage.tsx` — one button: Continue with Twenty.
- `frontend/src/lib/apiClient.ts` — `getAuthToken()` reads `localStorage` on every call.

## The deployment layers, and how each was crossed

The instance is three-deep. Sign-in has to cross all three:

1. **auth-guard nginx** (basic auth on everything except bare `/rest`, `/graphql`, `/metadata`, `/webhooks`, `/s`) — crossed by the browser's **native `user:pass` prompt at `/authorize`** (once per profile/session, cached by the browser), and by the backend's `basicAuthFetch()` on all server-side OAuth calls. Credentials are **not** in this repo; they live in `.env.local` (gitignored).
2. **Twenty's own sign-in** — unchanged from normal Twenty use (email + workspace password, or whatever the workspace has). The dialer never sees it.
3. **The dialer itself** — no credentials at all; identity arrives as a proven, introspected token minted into a 7-day JWT.

## What kept breaking during bring-up, and the fix in each case

1. **"OAuth state mismatch" under React StrictMode.** Dev React runs the
   callback effect twice; the v1 `finishSignIn` deleted the pending PKCE
   entry *before* the exchange finished, so the second run found no entry
   and threw. Fix: a module-level in-flight cache keyed by `code` —
   concurrent calls with the same code return the same Promise, and the
   pending entry is only removed **after** redemption succeeds.
2. **Stale Vite transform after editing a lib module.** After the fix
   above landed, tests still failed and the error stack pointed at a
   **line that no longer existed** in `oauth.ts` (line 71 of the pre-fix
   file) — the browser was executing a cached transform. Fix: restart the
   dev server after breaking edits to lib modules. If your error stack's
   line numbers don't match the file, the served bundle is stale.
3. **Injected-header shadowing in the test harness.** The automation
   crosses the nginx guard with `setExtraHTTPHeaders({authorization:
   'Basic …'})`; that header then rides on *every* request the page makes,
   including the SPA's own `GET /api/auth/me`, which got 401 and bounced to
   `/login`. This looked like a product bug and was not: the exact minted
   JWT returns **200** from a clean client (PowerShell) with the right
   `Authorization: Bearer`. Rule of thumb: a header you injected to reach
   the *upstream* can silently replace the header your *own* API expects.
4. **Root-vs-backend `.env.local`.** The backend loads the root file only;
   OAuth vars placed in `backend/.env.local` alone do nothing. Both copies
   exist in this repo's layout, and `VITE`/`TWENTY` vars must be edited
   in the root one.

## How it was proven working

Reproducible steps, all against the live instance:

1. `GET /api/auth/me` with the minted JWT → **200** `{"id":"operator@twenty",…}` (and the backend log line `GET /me: operator@twenty`).
2. Backend log on each sign-in: `OAuth session minted for: operator@twenty` — the `/token`→`/session` chain completed server-side.
3. Post-callback storage: `localStorage["cold-dialer-token"]` present; `sessionStorage["dialer.operator.session"]` present with the Twenty access + refresh tokens.
4. Decoded JWT payload matches the introspected identity (`userId`, `twentyUserId`, `email` = `operator@twenty`; `iat`/`exp` 7 days apart).
5. Frontend + backend `tsc --noEmit` clean; `bun run api:check` passes on the emitted `packages/shared` client.

## Known open items

- **SPA-side refresh is not wired.** `/api/oauth/refresh` exists and the
  Twenty refresh token is persisted in `sessionStorage`, but nothing in the
  SPA calls it today; the user re-authenticates when the 7-day JWT lapses.
- **Restart the dev server after lib-module edits** (stale transform,
  item 2). A hot-reload restart would make this a non-issue.
- **Basic-auth credentials for the guard are entered by hand** (the browser
  prompt). If the workspace switches guard credentials, `TWENTY_BASIC_*` in
  the root `.env.local` and the browser profile both need the new values.