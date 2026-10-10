---
type: is
id: is-01m4d783tgccasm0mja53aq5xd
title: Build and hosting for the forked frontend
kind: task
status: closed
priority: 1
version: 2
spec_path: docs/twenty-parity-audit.md
labels:
  - wayfinder:research
dependencies: []
parent_id: is-01m4d4x6hvs6gtgptbbfy0fdvt
created_at: 2026-10-08T07:39:36.144Z
updated_at: 2026-10-08T07:39:37.730Z
closed_at: 2026-10-08T07:39:37.729Z
close_reason: "DECISION: build in GitHub Actions (ubuntu, 16GB) with Twenty's toolchain, inject window._env_ at build time, deploy the static output with vercel deploy --prebuilt to the existing project's frontend service at dialer.listeningkit.com (SPA rewrite kept); backend service unchanged. Avoids Vercel's 8GB build limit and the Windows-only quirks found in the spike."
resolution: null
duplicate_of: null
---
## Question

twenty-front builds with NODE_OPTIONS=--max-old-space-size=8192 and a multi-package nx pipeline. Decide where it builds and how it deploys alongside the existing Vercel backend service.
