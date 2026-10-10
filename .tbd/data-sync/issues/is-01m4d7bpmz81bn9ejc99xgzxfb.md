---
type: is
id: is-01m4d7bpmz81bn9ejc99xgzxfb
title: "Step 4: dialer-bridge.js (refresh/sign-out) + Dialer PKCE in modules/dialer/auth"
kind: task
status: closed
priority: 1
version: 4
spec_path: docs/project/specs/active/plan-2026-10-08-twenty-shell.md
labels: []
dependencies:
  - type: blocks
    target: is-01m4d7bqsdj0a03sgy10xendnv
  - type: blocks
    target: is-01m4d7bt1xsv25dyt41t1h4vaq
parent_id: is-01m4d7bj5te29e5d90g87nt3ae
created_at: 2026-10-08T07:41:33.727Z
updated_at: 2026-10-08T08:34:42.535Z
closed_at: 2026-10-08T08:34:42.535Z
close_reason: "Superseded 2026-10-08 by wayfinder map dialer-64uy: owner wants a standalone Twenty-styled power dialer, not twenty-front vendored. Work kept unmerged on branch feat/twenty-shell for reference."
resolution: null
duplicate_of: null
---
Proactive refresh 2m before exp, refresh on 401/UNAUTHENTICATED single-flight via /api/oauth/refresh; /login + /callback routes; SignInUp -> /login patch; backend JWT minted for Dialer routes.
