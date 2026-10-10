---
type: is
id: is-01m4d5qxz9w56a4x65cgapkc37
title: Diagnose dialer rejection after successful Twenty OAuth sign-in
kind: bug
status: open
priority: 1
version: 4
docs:
  - path: docs/project/research/research-2026-10-08-dialer-oauth-session-rejection.md
labels: []
dependencies:
  - type: blocks
    target: is-01m4d61cj8ktjxw0zt8h24jf6f
created_at: 2026-10-08T07:13:17.289Z
updated_at: 2026-10-08T07:18:27.144Z
---

## Notes

Research brief: docs/project/research/research-2026-10-08-dialer-oauth-session-rejection.md. Source trace shows this exact toast occurs after POST /api/oauth/session succeeded, then refreshUser cleared the stored dialer JWT because local validation failed or GET /api/auth/me returned 401. Production public health and OAuth config both returned 200 on 2026-10-08 and point to the expected Twenty instance/callback; this does not prove matching JWT_SECRET or backend routing. Leading hypothesis is JWT signer/verifier mismatch or request routing across differently configured backend instances, not established. Need failing attempt's sanitized /api/oauth/session and /api/auth/me statuses and correlated backend logs to confirm.
