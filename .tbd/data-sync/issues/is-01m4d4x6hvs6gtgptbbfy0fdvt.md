---
type: is
id: is-01m4d4x6hvs6gtgptbbfy0fdvt
title: "Wayfinder: Dialer on Twenty primitives (1:1 parity)"
kind: epic
status: closed
priority: 1
version: 15
spec_path: docs/twenty-parity-audit.md
labels:
  - wayfinder:map
dependencies: []
child_order_hints:
  - is-01m4d4xq89hcb5mg2embyqzt5z
  - is-01m4d4xrf20rxx3rbw5ewqsmrg
  - is-01m4d4xsn039m3za45dqr5x23e
  - is-01m4d4xttb15dnk0gndshe3f0y
  - is-01m4d4xvz25n6jh5mvd0rtrzdw
  - is-01m4d4xx4ptqn8dxw497y9e0zh
  - is-01m4d77x7cd8x5az88yw38v162
  - is-01m4d77zej8fvht5daxvpartq0
  - is-01m4d781kzcj80ksgt0g0jrct6
  - is-01m4d783tgccasm0mja53aq5xd
created_at: 2026-10-08T06:58:41.339Z
updated_at: 2026-10-08T07:41:41.170Z
closed_at: 2026-10-08T07:41:41.169Z
close_reason: "Map resolved: all decision tickets closed; way to destination clear. Implementation tracked by epic dialer-tr27 (spec docs/project/specs/active/plan-2026-10-08-twenty-shell.md)."
resolution: null
duplicate_of: null
---
## Destination

A decided, sequenced implementation plan (spec + tbd beads) for rebuilding the dialer UI on Twenty v2.41.0's actual primitives — theme tokens, icons, menus, record table with treadmill virtualisation, metadata-driven fields, Twenty GraphQL record model — with Dialer features (softphone, recordings, scripts, campaigns) layered on top. Nothing left to decide before building.

## Notes

- Source of truth: twentyhq/twenty tag `twenty/v2.41.0` (local: `REPOS/twenty`). Audit: `docs/twenty-parity-audit.md`.
- Owner directive (2026-10-08): resolve decisions from the Twenty source autonomously and record them on the ticket; only genuine product/legal calls go to the owner. Owner wants byte-for-byte parity and accepts the licensing consequence.
- Skills: research tickets via the `research` skill; implementation via tbd (`plan-implementation-with-beads`, `implement-beads`).
- No new UI on top of the current `--ods` / per-page tables.

## Decisions so far

- [License: port twenty-front verbatim or reimplement](dialer-r73i): port verbatim, byte-for-byte; relicense to AGPLv3 with the first ported file.
- [Table reads: browser to Twenty GraphQL or backend proxy](dialer-3p0j): browser calls Twenty `/graphql` + `/metadata` with the operator's OAuth token as Bearer (proven, 748 prospects).
- [Retire the legacy record shape](dialer-3a42): UI uses raw Twenty field names; backend mappers and `types/database.ts` retire as consumers move.
- [Spike: twenty-front as the Dialer shell](dialer-qj4i): proven in Chromium + WebKit; upstream diff is `index.html` (+2 lines) and `dialer-bridge.js`.
- [Record table design](dialer-skyr): it is twenty-front's RecordTable, vendored; Dialer table code is deleted.
- [View state](dialer-vx61): Twenty's own views; Dialer localStorage/column state retired.
- [Vendoring layout](dialer-2wuq): `twenty/` at tag d1bb92d1, `VENDOR.json` patch list, CI byte-identity check.
- [Auth inside the fork](dialer-112q): Dialer PKCE is the only sign-in; the bridge refreshes 30-minute tokens via `/api/oauth/refresh`.
- [Where Dialer features attach](dialer-du95): Dialer objects are plain Twenty pages; softphone panel, record command items and call widget live in `modules/dialer`.
- [Build and hosting](dialer-8shf): GitHub Actions build, `vercel deploy --prebuilt`.

## Not yet specified

- Softphone panel UX inside the Twenty shell (placement vs side panel, keyboard model): settle while building the panel against twenty-ui primitives.
- Dark theme toggle (ships with Twenty; confirm nothing Dialer-specific breaks).

## Out of scope

- Production auth failure: separate bug, bead dialer-v5lo.

## Notes

- Source of truth: twentyhq/twenty tag `twenty/v2.41.0` (local: `REPOS/twenty`, sparse: twenty-front, twenty-ui, twenty-shared). Audit: `docs/twenty-parity-audit.md`.
- Owner directive (2026-10-08): resolve decisions from the Twenty source autonomously and record them on the ticket; only genuine product/legal calls go to the owner.
- Skills: research tickets via the `research` skill; implementation later via tbd (`plan-implementation-with-beads`, `implement-beads`).
- No new UI on top of the current `--ods` / per-page tables until this map is resolved.

## Decisions so far

- [License: port twenty-front verbatim or reimplement](dialer-r73i): port verbatim, byte-for-byte; relicense to AGPLv3 with the first ported file.

## Not yet specified

- Record show page parity (twenty-front record-show + field list + timeline) and where call/recording/script panels attach.
- Side panel / command menu parity and keyboard model (hotkeys, soft focus).
- Kanban/board for campaigns or call outcomes — only if a Twenty view type fits.
- Dark theme (`theme-dark.css` ships; wiring depends on the token decision).
- Migration order per page (Prospects first is assumed; confirm after the table decision).

## Out of scope

- Production auth failure — separate bug, bead dialer-v5lo.

## Notes

- Source of truth: twentyhq/twenty tag `twenty/v2.41.0` (local: `REPOS/twenty`, sparse: twenty-front, twenty-ui, twenty-shared). Audit: `docs/twenty-parity-audit.md`.
- Owner directive (2026-10-08): resolve decisions from the Twenty source autonomously and record them on the ticket; only genuine product/legal calls go to the owner.
- Skills: research tickets via the `research` skill; implementation later via tbd (`plan-implementation-with-beads`, `implement-beads`).
- No new UI on top of the current `--ods` / per-page tables until this map is resolved.

## Decisions so far

## Not yet specified

- Record show page parity (twenty-front record-show + field list + timeline) and where call/recording/script panels attach.
- Side panel / command menu parity and keyboard model (hotkeys, soft focus).
- Kanban/board for campaigns or call outcomes — only if a Twenty view type fits.
- Dark theme (`theme-dark.css` ships; wiring depends on the token decision).
- Migration order per page (Prospects first is assumed; confirm after the table decision).

## Out of scope

- Production auth failure — separate bug, bead dialer-v5lo.
