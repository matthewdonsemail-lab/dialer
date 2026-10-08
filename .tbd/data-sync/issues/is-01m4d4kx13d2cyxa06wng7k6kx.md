---
type: is
id: is-01m4d4kx13d2cyxa06wng7k6kx
title: "Auth: finish cross-browser OAuth hardening, verify, ship"
kind: bug
status: open
priority: 1
version: 1
labels: []
dependencies: []
created_at: 2026-10-08T06:53:36.674Z
updated_at: 2026-10-08T06:53:36.674Z
---
Root cause found + prod infra fixed 2026-10-08: node01 auth-guard gated Twenty's static shell (/assets, /manifest.json, /client-config, /images, /file) while /authorize HTML was public -> 412 basic-auth challenges per /authorize load; Safari/Opera re-prompt loop, fresh browsers blank page with no Authorize button. Live nginx patched (backup nginx.conf.bak-20261007-233914-public-shell); verified 0 challenges + full prod sign-in in WebKit & Chromium with no basic creds.
Second defect: express-rate-limit keyed on req.ip = Cloudflare/Vercel proxy -> ALL users share one bucket (proven from 2 public IPs). Fixed on branch fix/auth-cross-browser (backend/src/lib/client-ip + test).
Frontend hardening on branch (uncommitted): ApiError w/ status; AuthProvider restores from JWT, only 401 signs out, focus revalidate throttled 5m; PKCE pending keyed by state in localStorage w/ 15m TTL (callback in new tab); main.tsx chunk-reload ignores aborted loads on pagehide and never reloads /callback; CallbackPage (user edited to toasts).
Remaining: fix harness selector in scratch auth-scenarios.cjs (email placeholder), run baseline vs local in webkit+chromium, sync ops/node01/auth-guard-nginx.conf default server block + docs/identity.md + runbook (do NOT re-commit secrets already in that file; recommend rotating X-Origin-Site-Secret & editor_session), PR + prod deploy.
