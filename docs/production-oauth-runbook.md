# Production OAuth incident and runbook

This records the October 2026 production outage on `dialer.listeningkit.com`,
the changes that caused each failure, the recovery, and checks to run after
future deploys. User-facing behavior is described in [identity.md](./identity.md);
the password-to-OAuth migration is covered in
[oauth-migration-notes.md](./oauth-migration-notes.md).

## Current production flow

```mermaid
sequenceDiagram
    participant B as Browser at dialer.listeningkit.com
    participant V as Vercel backend
    participant G as node01 auth-guard
    participant T as Twenty
    B->>V: GET /api/oauth/config
    V->>G: discover metadata (Basic Auth)
    G->>T: /.well-known/oauth-authorization-server
    V-->>B: client ID, callback, endpoints
    B->>T: /authorize with PKCE S256
    T-->>B: redirect /callback?code&state
    B->>V: POST /api/oauth/token (code + verifier)
    V->>G: POST /oauth/token (public client)
    G->>T: token request; strip Authorization header
    T-->>V: Twenty access token
    B->>V: POST /api/oauth/session (Twenty access token)
    V->>G: /oauth/introspect (Basic Auth)
    G->>T: verify token
    V->>T: REST lookup of workspaceMembers
    T-->>V: resolved member
    V-->>B: 24-hour dialer JWT
```

`/authorize` and `/oauth/token` are open at the auth-guard and strip the
incoming Basic `Authorization` header before proxying to Twenty. The backend
uses `TWENTY_BASIC_USER` and `TWENTY_BASIC_PASSWORD` for discovery and
introspection, which remain guarded. The OAuth client is public PKCE:
`token_endpoint_auth_method: none`, with no client secret.

## Incident timeline and root causes

The failures were separate and sequential. Fixing one exposed the next; they
should not be treated as one generic “OAuth 401”.

| Commit / observation | What changed or failed | Effect and resolution |
|---|---|---|
| `c3fe77b` → `0beb9f4` → `1392e76` → `5b2592a` | Backend output changed from an ESM server bundle to CommonJS (`dist/index.cjs`), while Vercel's service entrypoint lagged behind. Deployment logs first reported that the configured entrypoint did not exist. Pointing Vercel at the generated output still failed because Services validate their entrypoint before the build produces it. | The service now points at `backend/src/index.ts`, which the Express preset can build. `1392e76` also prevents a read-only filesystem mkdir from aborting startup. The deployed service builds as `services/backend/index`. |
| `8520bb8` | The frontend Vercel service had no SPA fallback. | Direct navigation to `/login`, `/dashboard`, or `/callback` returned Vercel `404 NOT_FOUND`. The frontend service now rewrites app paths to `/index.html`. |
| `397755a` + missing Production setting | This security change added an exact-origin CORS allowlist using `FRONTEND_URL` and a deliberate `403 {"error":"Origin not allowed"}` response. The Vercel Production project had no `FRONTEND_URL`. | The browser returned from Twenty, but `POST /api/oauth/token` was rejected by Express before the OAuth handler ran. A request with `Origin: https://dialer.listeningkit.com` reproduced exactly `403 {"error":"Origin not allowed"}`. Setting Production `FRONTEND_URL=https://dialer.listeningkit.com` fixed it; the next real token exchange returned `200`. |
| Missing Production OAuth variables | Vercel had `TWENTY_BASE_URL` and `TWENTY_API_KEY`, but no OAuth client/callback settings or Basic Auth pair. | `/api/oauth/config` returned “Twenty SSO is not configured on the backend”. A public PKCE client was registered against the actual Twenty instance with the production callback; the corresponding runtime settings were added to Vercel. |
| Session step after successful code redemption | Twenty introspection succeeded and the returned user claim resolved to a real `workspaceMember`. Vercel had no valid `JWT_SECRET`. | `generateToken()` refused to mint a JWT; the route surfaced this as `502`. A random production-only secret of at least 32 characters was added. The user then confirmed the flow worked. |

### What was not the cause

- `net::ERR_BLOCKED_BY_CLIENT` for
  `static.cloudflareinsights.com/beacon.min.js` is the browser blocking
  Cloudflare's analytics beacon, commonly due to an extension. It does not
  block the OAuth API.
- A slow-font intervention or fallback font is a rendering/performance notice,
  not an authentication failure.
- The earlier `vite.svg` 404 was a template icon reference. The frontend now
  serves its own favicon. It did not cause the token 403.
- Cloudflare DNS/proxying was not the cause of these authentication errors:
  the token request reached the Vercel Express handler, which returned
  `Origin not allowed`, and reached Twenty after the allowlist was corrected.

## Relevant OAuth history

- `8e7ebe1` introduced the first PKCE browser → callback → token → session flow.
  Its local proof minted a placeholder `operator@twenty` identity.
- `3479be8` removed that fake fallback. If a token cannot be matched to a real
  workspace member, session creation must fail with a useful `403`; this was
  correct security behavior, not the production regression.
- `7103e54`, `f1a9e9a`, and `3925e34` resolve Twenty application tokens through
  user claims and repair the member resolver. A Twenty `sub` can be an
  application ID, so it must not be mistaken for the signed-in person.
- `397755a` introduced the strict CORS allowlist and JWT-secret enforcement.
  These protections are correct; Production was missing the configuration
  they require.
- `1392e76` and `5b2592a` resolved Vercel's backend service entrypoint/build
  timing mismatch; `8520bb8` restored direct SPA route handling.

The regression was not a broken PKCE implementation. It was Production drift
across independent contracts: Vercel's service entrypoint, SPA routing, OAuth
runtime variables, exact frontend origin, and the required JWT signing secret.
Once these were restored, real token redemption and workspace-member
resolution succeeded.

## Required Vercel Production environment

Keep server-only settings on the backend service. Never use a `VITE_` prefix
for secrets; Vite values are public in the browser bundle.

| Variable | Production value / requirement | Why |
|---|---|---|
| `TWENTY_BASE_URL` | Public HTTPS origin of the real Twenty instance, e.g. `https://twenty.example.com` | OAuth discovery, code exchange, and introspection. |
| `TWENTY_API_KEY` | Valid Twenty API key; store as a Secret | Resolving the authenticated user to a workspace member uses the Twenty REST API. |
| `TWENTY_OAUTH_CLIENT_ID` | Client ID returned by `POST /oauth/register` | Identifies the public PKCE client. |
| `TWENTY_OAUTH_CLIENT_SECRET` | Unset/empty for this public client | Twenty advertises `none`; do not turn it into a confidential client. |
| `TWENTY_OAUTH_REDIRECT_URI` | `https://dialer.listeningkit.com/callback`, exactly as registered | The authorize and token requests must use the registered callback verbatim. |
| `TWENTY_OAUTH_SCOPE` | `api profile` | Requested by the current flow. |
| `TWENTY_BASIC_USER` / `TWENTY_BASIC_PASSWORD` | Current auth-guard credentials; both stored as Secrets | Backend discovery and introspection are behind the node01 auth-guard. |
| `FRONTEND_URL` | `https://dialer.listeningkit.com` (origin only, no path) | Exact CORS allowlist entry for browser API calls. |
| `JWT_SECRET` | Random secret, at least 32 characters; store as a Secret | Signs and validates the dialer's 24-hour bearer JWT. |

Any Vercel environment change needs a new Production deployment; changing
project settings does not update already running functions. Confirm the new
deployment is `Ready` and that the custom domain aliases it.

## Error handling by stage

Use the route and response body to find the failing boundary. The UI shows a
short message; the Vercel function log has the backend/provider detail.

| Observation | Meaning | What to check |
|---|---|---|
| `/login` or `/callback` returns Vercel `404 NOT_FOUND` | Frontend service is not applying its SPA rewrite, or the wrong deployment/domain is active. | `vercel.json` frontend rewrite `/(.*) → /index.html`, deployment status, and custom-domain alias. |
| `/api/oauth/config` returns `500` with “Twenty OAuth is not configured” | Required runtime config is absent. | `TWENTY_BASE_URL`, `TWENTY_OAUTH_CLIENT_ID`, and `TWENTY_OAUTH_REDIRECT_URI` in Production; then redeploy. |
| `/api/oauth/config` returns `502` or “Failed to read … discovery” | Vercel cannot fetch Twenty discovery metadata. | `TWENTY_BASE_URL`, Basic Auth pair, TLS/DNS, and `/.well-known/oauth-authorization-server`. |
| `/api/oauth/token` returns `403 {"error":"Origin not allowed"}` | CORS rejected the browser before the Hono OAuth route. This is the dialer's Express layer, not Twenty. | Set `FRONTEND_URL` to the exact page origin. Check scheme, hostname, and port. |
| `/api/oauth/token` returns provider `400 invalid_grant` / “Authorization code not found” | The code expired, was already used, or the request was diagnostic. Codes are single-use. | Start a new sign-in; never replay a code from a previous callback. |
| `/api/oauth/token` returns another provider error | The request reached Twenty but redemption failed. | Compare client ID, exact registered callback, the PKCE verifier/state in the same tab, client type, and provider detail in logs. |
| `/api/oauth/session` returns `401 Token is not active` | Introspection says the Twenty token is expired or invalid. | Sign in again; check `TWENTY_BASE_URL`, client ID, and Basic Auth pair. |
| `/api/oauth/session` returns `403` with workspace-member guidance | The Twenty token is live but its identity could not be matched to a member. | Check workspace membership and JWT user claims vs `workspaceMembers`. Never mint a fake identity. |
| `/api/oauth/session` returns `502` and log mentions `JWT_SECRET` | JWT signing config is missing or too short. | Set a random Production `JWT_SECRET` with 32+ characters and redeploy. |
| `/api/oauth/session` returns `502` with provider detail | Introspection or a dependent Twenty request failed. | Check Vercel error logs; verify Basic Auth, introspection reachability, and REST API key access. |
| Protected API calls return `401` after sign-in | No valid dialer JWT was stored, it expired, or it was signed with another secret. | Complete a fresh sign-in; confirm the session response succeeded before investigating member-scoped APIs. |

## Production verification checklist

After changing code or Vercel settings:

1. Inspect the Vercel Production deployment and confirm `Ready`; verify
   `https://dialer.listeningkit.com` is one of its aliases.
2. Open `https://dialer.listeningkit.com/login` directly and confirm the SPA
   loads. Deep links must not return Vercel 404s.
3. `GET /api/health` should be `200` with
   `twentyCrm.oauthConfigured: true` and `apiKeyConfigured: true`.
4. `GET /api/oauth/config` should be `200`; verify `redirectUri` is exactly
   `https://dialer.listeningkit.com/callback` and a client ID is present.
5. A harmless token probe using a made-up code and
   `Origin: https://dialer.listeningkit.com` should pass CORS and reach Twenty,
   which returns `400 invalid_grant`. `403 Origin not allowed` means the
   frontend origin is still missing or wrong. Never use a real callback code
   for this probe.
6. Complete a fresh browser sign-in. Confirm it reaches `/dashboard`; Vercel
   logs should show `/api/oauth/token` `200`, then
   `OAuth session minted for: <real-member>` and `/api/oauth/session` `200`.
7. Confirm a protected API call succeeds with the minted dialer JWT.

Useful read-only Vercel commands (replace placeholders with the deployment URL
and Vercel scope):

```bash
npx vercel inspect <deployment-url> --scope <team>
npx vercel logs <deployment-url> --since 1h --limit 100 --json --scope <team>
npx vercel env ls production --project <project-id> --scope <team>
```

Never pull secrets into committed files or paste values into issue reports. For
node01 health, use its configured Tailscale SSH identity and inspect `docker
ps`; do not put the host login password into an application environment or
script.
