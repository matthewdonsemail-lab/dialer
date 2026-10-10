# Research: Dialer Session Rejection After Twenty OAuth

**Date:** 2026-10-08 (last updated 2026-10-08)

**Author:** Codex

**Status:** In Progress

## Overview

Investigate why the browser can complete Twenty sign-in but then reports that the dialer rejected its new session. The key question is whether the failure occurs while the dialer exchanges the Twenty access token for its own JWT, or immediately afterward when `/api/auth/me` verifies that JWT.

## Questions to Answer

1. Which request causes the callback page to show the reported message?
2. What does the source code establish about how the dialer JWT is created and rejected?
3. What can be confirmed from the current production deployment, and what evidence is still needed to identify the root cause?

## Scope

Trace the frontend callback, session exchange, dialer token storage, `/api/auth/me`, backend JWT middleware, production health and OAuth configuration, and the existing production OAuth runbook. No sign-in was performed and no user token or secret was accessed.

## Findings

### Callback Message Trigger

`frontend/src/domains/auth/callback/callbackPage.tsx` calls `finishSignIn()`, then `refreshUser()`. The displayed message is specifically shown if `getAuthToken()` is empty after that refresh. In `frontend/src/domains/auth/provider/authProvider.tsx`, the token is removed only when the local token cannot be decoded/is expired, or when `/api/auth/me` returns HTTP 401. Transient errors, rate limits, and 5xx responses do not clear it.

`finishSignIn()` in `frontend/src/domains/auth/oauth/oauth.ts` redeems the code, calls `/api/oauth/session`, and stores the returned dialer JWT through `setAuthToken()`. A failed `/api/oauth/session` exchange instead throws its server error and follows the callback catch path; it does not produce this specific message.

### Backend Verification

`backend/src/routes/twenty/oauth/index.ts` introspects the Twenty token, resolves a real workspace member, and calls `generateToken()`. Both `generateToken()` and `authMiddleware()` in `backend/src/middleware/auth.ts` read `JWT_SECRET`; the middleware returns 401 when JWT verification throws. A missing or short secret prevents signing. If the token is signed with a different secret than the one used to verify it, `/api/auth/me` returns 401 and the frontend clears it.

### Production Read-Only Checks

On 2026-10-08, unauthenticated GET requests returned:

- `https://dialer.listeningkit.com/api/health`: HTTP 200; `status: ok`, `oauthConfigured: true`, and `apiKeyConfigured: true`.
- `https://dialer.listeningkit.com/api/oauth/config`: HTTP 200; authorization endpoint `https://twenty.inferencesaver.com/authorize`, callback `https://dialer.listeningkit.com/callback`, and scope `api profile`.

These responses prove that the public production endpoints are live and OAuth configuration is loaded. They do **not** reveal whether `/api/oauth/session` and `/api/auth/me` were served by the same backend instance, whether their JWT secrets match, whether a particular issued token was stored, or what response the user's `/api/auth/me` request received.

### Existing Operational Guidance

`docs/production-oauth-runbook.md` explains that missing/short `JWT_SECRET` causes `/api/oauth/session` to fail with 502, while protected requests returning 401 can indicate a missing, expired, or differently signed dialer JWT. The current callback message narrows this case further: the frontend observed no token after `refreshUser()`, which means a local token validation failure or `/api/auth/me` 401.

## Key Insights

The user-facing message does not mean Twenty rejected the credentials or the Twenty access token. The code indicates that Twenty sign-in and the `/api/oauth/session` exchange progressed far enough to enter the callback success handler; the subsequent dialer session verification failed or the stored JWT was considered invalid locally.

The leading deployment hypothesis is inconsistent JWT signing/verification configuration or backend routing between the two requests, but the current public health/config endpoints cannot establish that. An expired token is also possible if the flow was delayed or the token is stale, though a newly minted 24-hour token makes it less likely for an immediate failure.

## Recommendations

Capture the failing browser request statuses and correlate them with backend logs before changing configuration:

1. In browser Network, inspect `POST /api/oauth/session` and `GET /api/auth/me` from the same sign-in attempt. Record status codes and sanitized response bodies; never copy bearer tokens.
2. If `/api/oauth/session` is 200 and `/api/auth/me` is 401, correlate backend request/deployment logs and verify that the session mint and `/me` verification use the same `JWT_SECRET` and backend deployment. Redeploy after correcting runtime configuration, then perform a fresh sign-in.
3. If `/api/oauth/session` is not 200, use its status/body and the backend log entry to follow the session-stage cases in `docs/production-oauth-runbook.md`.
4. If `/api/auth/me` is not 401, inspect the stored token's presence and expiration locally without exporting or sharing the token, and capture the actual status from the failing attempt.

## Next Steps

- [ ] Get the two request statuses and sanitized response body from the failing sign-in.
- [ ] Correlate those requests with backend deployment/runtime logs.
- [ ] Update the bead with the confirmed root cause and corrective action.

## Methodology

Reviewed the callback page, OAuth client/session exchange, auth provider, API client, backend OAuth session route, JWT middleware, health/config routes, and production OAuth runbook. Queried production's public health and OAuth config endpoints with read-only GET requests. No credentials, bearer tokens, or user-specific records were accessed.

## References

- `frontend/src/domains/auth/callback/callbackPage.tsx`
- `frontend/src/domains/auth/provider/authProvider.tsx`
- `frontend/src/domains/auth/oauth/oauth.ts`
- `frontend/src/domains/api/client/apiClient.ts`
- `backend/src/routes/twenty/oauth/index.ts`
- `backend/src/middleware/auth.ts`
- `backend/src/routes/auth/index.ts`
- `docs/production-oauth-runbook.md`

<!-- This document follows common-doc-guidelines.md.
See github.com/jlevy/practical-prose and review guidelines before editing.
-->
