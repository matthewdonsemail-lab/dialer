---
type: is
id: is-01m4d781kzcj80ksgt0g0jrct6
title: Where do Dialer features attach in the Twenty shell?
kind: task
status: closed
priority: 1
version: 2
spec_path: docs/twenty-parity-audit.md
labels:
  - wayfinder:research
dependencies: []
parent_id: is-01m4d4x6hvs6gtgptbbfy0fdvt
created_at: 2026-10-08T07:39:33.887Z
updated_at: 2026-10-08T07:39:35.413Z
closed_at: 2026-10-08T07:39:35.412Z
close_reason: "DECISION: Calls (agencyCalls), Scripts, Agency Campaigns, Agency Phones, Agency Leads, Agency Prospects are already Twenty objects -> they are plain Twenty RecordIndex/RecordShow pages, no Dialer page code. Dialer-only behaviour lives in modules/dialer: (1) Softphone as a persistent app-shell panel built from twenty-ui primitives, mounted once in the authenticated layout (listed patch); (2) Call / script / disposition actions as record-scoped command menu items on agencyProspects + agencyLeads using twenty-front's command-menu item registry, opening the side panel; (3) recordings/AI analysis as a record-page widget on agencyCalls. The installed native app's GLOBAL 'Dialer' command item duplicates this and is uninstalled once the fork ships (bead)."
resolution: null
duplicate_of: null
---
## Question

Softphone, call recording, scripts, campaigns, call history, phone numbers: which become plain Twenty object pages and which are Dialer modules, and how they mount.
