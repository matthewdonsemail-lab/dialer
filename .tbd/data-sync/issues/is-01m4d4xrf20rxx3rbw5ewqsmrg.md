---
type: is
id: is-01m4d4xrf20rxx3rbw5ewqsmrg
title: "Spike: build twenty-front v2.41.0 as the Dialer shell (bearer adapter) and render agencyProspects in Twenty's own RecordTable"
kind: task
status: closed
priority: 1
version: 4
spec_path: docs/twenty-parity-audit.md
labels:
  - wayfinder:task
dependencies:
  - type: blocks
    target: is-01m4d4xvz25n6jh5mvd0rtrzdw
parent_id: is-01m4d4x6hvs6gtgptbbfy0fdvt
created_at: 2026-10-08T06:58:59.681Z
updated_at: 2026-10-08T07:38:50.377Z
closed_at: 2026-10-08T07:38:50.376Z
close_reason: "PROVEN 2026-10-08 in Chromium + WebKit. twenty-front v2.41.0 (unmodified src) built locally with Twenty's toolchain (yarn 4.13 from .yarn/releases; workspaces twenty-front, twenty-ui, twenty-shared, twenty-sdk, twenty-client-sdk, twenty-front-component-renderer; nx build of deps; vite dev :3001), served from a non-Twenty origin, authenticated ONLY via public/dialer-bridge.js (Bearer = operator OAuth token, seeds isCookieAuthActiveState) + window._env_.REACT_APP_SERVER_BASE_URL=https://twenty.inferencesaver.com in index.html. Rendered /objects/agencyProspects against prod: All Agency Prospects · 748, Twenty's own table/sidebar/view bar; all /metadata + /graphql calls 200; treadmill fetches FindManyAgencyProspects limit 60 then limit 140 at offsets 0..460 while scrolling. Upstream diff: index.html (+2 lines), public/dialer-bridge.js (new). Windows build notes: needs a yarn shim on PATH (twenty-ui build calls yarn), twenty-sdk third build command needs rimraf --glob under bash, renderer needs generate-remote-dom-elements + sandbox:prebuild; renderer tsgo d.ts step has env type errors (JS dist fine). Screenshots: scratchpad/shots/spike-*.png"
resolution: null
duplicate_of: null
---
## Question

Byte-for-byte parity means running twenty-front's own record index/show (closure: 3847 of ~8000 src files, 90+ packages, plus workspace twenty-shared + twenty-front-component-renderer). Can twenty-front v2.41.0 be built with its own toolchain outside Twenty's deployment, served from a different origin, authenticated with the operator's OAuth token via ApolloFactory optionHeaders, and render /objects/agencyProspects against the prod Twenty instance? Record: build commands, env, every file changed vs upstream, and whether the treadmill table loads 748 records.
