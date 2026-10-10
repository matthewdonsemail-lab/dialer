---
type: is
id: is-01m4d77zej8fvht5daxvpartq0
title: "Auth inside the fork: sign-in, 30-minute token refresh, sign-out"
kind: task
status: closed
priority: 1
version: 2
spec_path: docs/twenty-parity-audit.md
labels:
  - wayfinder:research
dependencies: []
parent_id: is-01m4d4x6hvs6gtgptbbfy0fdvt
created_at: 2026-10-08T07:39:31.666Z
updated_at: 2026-10-08T07:39:33.176Z
closed_at: 2026-10-08T07:39:33.175Z
close_reason: "DECISION: keep the Dialer's PKCE flow (moved to modules/dialer/auth: /login, /callback) as the only sign-in; patch AppPath.SignInUp routing so unauthenticated users land on /login (one listed patch). dialer-bridge.js owns the token: stores access+refresh (localStorage, per-origin), refreshes proactively 2 min before exp and on a GraphQL UNAUTHENTICATED/401, single-flight, via backend POST /api/oauth/refresh (public client, refresh never leaves first-party storage+backend). The backend dialer JWT (POST /api/oauth/session) stays for Dialer-owned backend routes. Sign-out clears both and revokes. Cross-browser fixes on branch fix/auth-cross-browser (rate-limit keying, PKCE state store) carry over."
resolution: null
duplicate_of: null
---
## Question

twenty-front redirects unauthenticated users to its own SignInUp (cookie-based, unusable cross-site). Twenty OAuth application access tokens last 30m (APPLICATION_ACCESS_TOKEN_EXPIRES_IN), refresh 60d. Decide sign-in entry, refresh and sign-out.
