---
type: is
id: is-01m4d4xvz25n6jh5mvd0rtrzdw
title: "Record table design: structure, virtualisation, cell modes, column state"
kind: task
status: closed
priority: 1
version: 2
spec_path: docs/twenty-parity-audit.md
labels:
  - wayfinder:research
dependencies: []
parent_id: is-01m4d4x6hvs6gtgptbbfy0fdvt
created_at: 2026-10-08T06:59:03.266Z
updated_at: 2026-10-08T07:38:51.524Z
closed_at: 2026-10-08T07:38:51.523Z
close_reason: "Resolved by the spike: the Dialer's record table IS twenty-front's RecordTable (vendored verbatim), not a reimplementation. Structure, 32px rows, sticky columns, CSS-var widths, display/hover/focus/edit portals, treadmill virtualisation (60 initial, 140-record overscan windows), skeletons, selection, filters/sorts via computeRecordGqlOperationFilter/turnSortsIntoOrderBy all come from upstream unchanged. The Dialer's own table code (ProspectPage, LeadsPage, CampaignPage, CallHistoryPage, PhoneNumbersPage tables; components/common Sortable/Header/Column*/Status*; hooks use-column-order/use-column-widths) is deleted, not ported."
resolution: null
duplicate_of: null
---
## Question

Given the license and transport decisions, define the dialer RecordTable: div grid + sticky columns + CSS-var widths, 32px rows, display-only cells with single hovered/focused/edit portal, treadmill virtualisation (240 slots, 30 initial, ±7×10 overscan pages), skeleton rows, empty/error states, selection. Which parts come from twenty-ui, which are reimplemented, file layout, and the API pages consume.
