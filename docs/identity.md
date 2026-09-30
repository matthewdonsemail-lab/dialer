---
title: "Identity: signing in with Twenty"
tags: [auth, oauth, identity, twenty]
status: active
created: 2026-09-29
---

# Identity: signing in with Twenty

The dialer has no password database and no sign-up form. **Twenty is the
identity provider**: the "Continue with Twenty" button on the dialer's
login page signs you in through Twenty's own OAuth (PKCE) flow, and the
dialer mints a short-lived JWT from the proven token so every existing
`Authorization: Bearer` route keeps working.

There is exactly one place the dialer still asks for credentials: your
**Twenty** workspace account. The dialer itself never does.

## What the user sees

1. The dialer login page shows one button: **Continue with Twenty**.
2. Clicking it redirects the browser to the Twenty instance
   (`/authorize?...code_challenge=...`).
3. Twenty's normal sign-in/consent screen appears (email + workspace
   password, or a second-factor step if your workspace has one). If you
   are already signed in to Twenty in that browser, the consent screen
   appears directly.
4. Click **Authorize** and the browser lands back on the dialer
   (`/callback?code=...&state=...`), which finishes in under a second
   and takes you straight to **/dashboard**.

No dialer password is ever created, stored, or asked for.

### auth-guard must not gate the OAuth handshake

The instance is fronted by an auth-guard nginx that puts HTTP basic auth on
everything except `/rest`, `/graphql`, `/metadata` and `/webhooks`. That gate
**must not** cover `/authorize` or `/oauth/token`, and the `Authorization` header
must be stripped on both:

```nginx
location = /authorize {
  proxy_pass http://127.0.0.1:3005;
  include /etc/nginx/proxy-params.conf;
  proxy_set_header Authorization "";
}
location ^~ /oauth/token {
  proxy_pass http://127.0.0.1:3005;
  include /etc/nginx/proxy-params.conf;
  proxy_set_header Authorization "";
}
```

`proxy-params.conf` forwards `Authorization $upstream_authorization`, so without
the strip the browser's cached basic header reaches Twenty. Twenty then treats
the caller as a service and returns an `APPLICATION_ACCESS` token whose
`sub === applicationId` and whose `userId` / `userWorkspaceId` are placeholders
that match no `core."user"` row. No human is left in the token, so the session
cannot be mapped to a workspace member and the dialer shows `operator@twenty`.

`/oauth/introspect` stays gated: the backend calls it with its own credentials.
`token_endpoint_auth_methods_supported` includes `none`, so the public PKCE
client authenticates on `client_id` in the form body alone.

The config lives at `/home/deepman/services/auth-guard/nginx.conf` on node01 and
is bind-mounted **read-only** into the container — edit the host file, then
`nginx -t` and `nginx -s reload` inside `auth-guard`. `docker cp` fails with
`EBUSY` and in-place writes with `EROFS`.


## What happens underneath

```
dialer SPA                 dialer backend                Twenty (behind auth-guard)
    |                            |                                  |
    |-- GET /api/oauth/config -->|                                  |
    |<-- {authorizeEndpoint,     |-- /.well-known/... (Basic) ----->|
    |     clientId, ...}         <- (endpoints) --------------------|
    |                            |                                  |
    |-- save PKCE state+verifier (sessionStorage)                   |
    |-- REDIRECT /authorize?... PKCE ... -------------------------->
    |                            |                     | native basic-auth prompt (once)
    |                            |                     | email+password in Twenty's UI
    |                            |<-- user clicks Authorize         |
    |<- REDIRECT /callback?code=...&state=... --------|             |
    |                            |                                  |
    |-- POST /api/oauth/token -->|-- POST /oauth/token (Basic) ---->|
    |<-- {data: Twenty tokens}   <- {access, refresh, ...} --------|
    |                            |                                  |
    |-- POST /api/oauth/session ->|-- introspect token (Basic) ---->|
    |<-- {dialer JWT (7d)}       <- {active, username} ------------|
    |                            |                                  |
    |-- navigate /dashboard      |                                  |
```

Route map (backend Hono sub-app at `/api/oauth`):

| Endpoint            | Purpose                                                        |
|---------------------|----------------------------------------------------------------|
| `GET  /api/oauth/config`  | Public discovery for the SPA: authorize endpoint, client id, redirect URI, scope. |
| `POST /api/oauth/token`   | Exchange `code` + PKCE `verifier` for Twenty tokens (server-side only). |
| `POST /api/oauth/refresh`  | Refresh a Twenty access token from a refresh token (server-side, not yet called by the SPA). |
| `GET  /api/oauth/me`      | Introspect a presented Bearer token; 401 if not active.        |
| `POST /api/oauth/session` | Introspect a live Twenty token and mint the dialer JWT.        |

## Tokens, and where they live

| Token | Who holds it | Lifetime | Storage |
|---|---|---|---|
| PKCE `state` + `verifier` | browser | one sign-in (~15 min) | `sessionStorage` |
| Twenty `access` / `refresh` | browser (+ backend memory) | per Twenty defaults | `sessionStorage` (cleared when the tab closes) |
| Dialer JWT (minted) | browser | 7 days | `localStorage` (`cold-dialer-token`) |

The dialer JWT is what every existing API route checks. It is minted from a
token that Twenty's introspection just proved live, so a token stolen from
`localStorage` is only worth what the presented Twenty token was.

## Configuring it (operator)

Everything lives in the **root** `.env.local` (the backend reads the root
file; `backend/.env.local` is a mirror copy for running `bun` in that
directory):

```env
TWENTY_BASE_URL=https://twenty.inferencesaver.com
TWENTY_API_KEY=...                       # REST writes (bare /rest is exempt from the guard)

TWENTY_OAUTH_CLIENT_ID=...               # public PKCE client, no secret needed
TWENTY_OAUTH_CLIENT_SECRET=              # leave unset for a public PKCE client
TWENTY_OAUTH_REDIRECT_URI=http://localhost:5173/callback
TWENTY_OAUTH_SCOPE=api profile

# Only if an auth-guard nginx (or similar) fronts the instance with basic auth:
TWENTY_BASIC_USER=...
TWENTY_BASIC_PASSWORD=...
```

The client is a **public PKCE-only** client (dynamic registration via
`POST /oauth/register`, no `token_endpoint_auth`). Its registered redirect
URI must match `TWENTY_OAUTH_REDIRECT_URI` exactly, so the frontend dev
server is pinned to port **5173** (`--strictPort`) and the callback path is
`/callback`.

## When sign-in breaks

| Symptom | Meaning | See |
|---|---|---|
| "OAuth state mismatch. Start sign-in again." | PKCE state didn't survive the redirect (tab closed, or an old frontend bundle still running — restart the dev server). | [oauth-migration-notes.md](./oauth-migration-notes.md) |
| Native `user:pass` prompt loops / 401 at `/authorize` | Basic creds for the auth-guard are wrong or expired. | [twenty-troubleshooting.md](./twenty-troubleshooting.md) |
| "Twenty OAuth is not configured" from `/api/oauth/*` | OAuth vars missing from the **root** `.env.local`. | This file's config section. |
| Consent 302s to `/callback?error=...` | The redirect URI in the client record doesn't match `--port 5173`. | This file's config section. |
| Browser shows `ERR_CONNECTION_REFUSED` at `localhost:5173/callback` after clicking Authorize | The frontend dev server is not on 5173 (e.g. it was started with `--port 3000`, or Vite silently hopped ports because 5173 was busy). `frontend/vite.config.ts` pins `port: 5173` with `strictPort: true`; start it with plain `npm run dev` / `bun run dev:frontend` and open http://localhost:5173. The login page also refuses to start sign-in with a plain-English error when the origins differ. | [vite.config.ts](../frontend/vite.config.ts) |

## What the dialer deliberately does not do

- Store or hash any dialer-side password (the old Postgres `users` path is gone).
- Hold the client secret (the client is public; the secret column is empty).
- Trust a token that does not pass Twenty introspection at session-mint time.
- Keep the Twenty refresh-token flow wired to the SPA yet: the server route
  exists and is exercised in tests, but the SPA presently finishes with a 7-day
  dialer JWT and re-signs-in on expiry rather than silently refreshing.