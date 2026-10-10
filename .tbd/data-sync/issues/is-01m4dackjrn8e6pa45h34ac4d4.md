---
type: is
id: is-01m4dackjrn8e6pa45h34ac4d4
title: "Table, header, sidebar, side panel: what comes from twenty-ui and what must be ported from twenty-front?"
kind: task
status: open
priority: 1
version: 1
labels:
  - wayfinder:research
dependencies: []
parent_id: is-01m4dabwb11k9spz81qfggjjbs
created_at: 2026-10-08T08:34:29.079Z
updated_at: 2026-10-08T08:34:29.079Z
---
## Question

For Twenty's record table (32px rows, sticky first column, display/hover/edit cell modes, treadmill virtualisation), page header, navigation drawer, and side panel that expands to a full page: identify the twenty-front files that define each, their dependency closure without Twenty's metadata/Apollo/Jotai stores, and the minimal standalone port that keeps markup, styles and behaviour identical. Output: a per-component port list.
