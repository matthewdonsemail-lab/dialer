---
type: is
id: is-01m4d4xx4ptqn8dxw497y9e0zh
title: "View state: Twenty view objects, URL, or local storage?"
kind: task
status: closed
priority: 1
version: 2
spec_path: docs/twenty-parity-audit.md
labels:
  - wayfinder:research
dependencies: []
parent_id: is-01m4d4x6hvs6gtgptbbfy0fdvt
created_at: 2026-10-08T06:59:04.470Z
updated_at: 2026-10-08T07:38:52.642Z
closed_at: 2026-10-08T07:38:52.641Z
close_reason: "Resolved by the spike: twenty-front loads the workspace's own views (FindAllViews, FindTableWidgetViews) from /metadata with the operator token, so the Dialer uses Twenty views natively: same columns/order/widths/filters/sorts as Twenty, URL carries viewId. Dialer-local view state (localStorage column order/widths, component-state filters, campaign tabs) is retired; campaign tabs become saved Twenty views or view filters on agencyProspects.campaignId."
resolution: null
duplicate_of: null
---
## Question

Twenty persists columns/order/widths/filters/sorts in view, viewField, viewFilter, viewSort and carries viewId in the URL. Decide whether the dialer reads/writes the same Twenty views for agencyProspects/leads (so a column change in Twenty shows in the dialer and back) or keeps its own.
