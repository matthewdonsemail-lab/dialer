---
type: is
id: is-01m4dabwb11k9spz81qfggjjbs
title: "Wayfinder: Dialer as a Twenty-styled power dialer (not Twenty itself)"
kind: epic
status: open
priority: 1
version: 7
labels:
  - wayfinder:map
dependencies: []
child_order_hints:
  - is-01m4dacfva8w4a5chbmncj8w1b
  - is-01m4dach38jhabf9bcqsp3qvjq
  - is-01m4dacjb4jk2b5ajd5t6m4vgb
  - is-01m4dackjrn8e6pa45h34ac4d4
  - is-01m4dacmwhnp76f2d6hnwvyx0b
created_at: 2026-10-08T08:34:05.280Z
updated_at: 2026-10-08T08:34:41.313Z
---
## Destination

The Dialer is a standalone **power dialer** that looks and behaves like Twenty without being Twenty: Twenty's table, page header, sidebar and side panel (opens beside the table, expands to a full page), built from Twenty's real UI primitives (`twenty-ui` package, theme tokens, Tabler icons), wrapped in a Twenty-style data/state structure with real-time sync. It shows only Dialer surfaces: prospect/lead tables to dial from, Scripts, Campaigns, Call recordings, Call history (table row → side panel → full page). End state of this map: a decided plan for getting the current `frontend/` app there.

## Notes

- Owner's words (2026-10-08): "made to look like 20, but operate separately from 20, using the packages for the front end, not having to do yarn"; "it's meant to literally just be a power dialer".
- Not this: vendoring/running `twenty-front` (branch `feat/twenty-shell`, epic `dialer-tr27`). That branch renders every Twenty object and its metadata; it is kept, unmerged, as reference only. Reusable from it: `docs/twenty-parity-audit.md` (token, primitive and table findings), the vendor/tamper tooling is not needed.
- Source of truth for look and patterns: `twentyhq/twenty` tag `twenty/v2.41.0` (local `REPOS/twenty`), the version node01 runs.
- Decide from Twenty source where possible; product calls go to the owner.

## Where we are against the destination (deviation snapshot)

- `main` / `frontend/`: own app with Dialer pages, but hand-rolled Tailwind `--ods-*` tokens (Tailwind palette, not Twenty's), `lucide` icons, per-page `<table>` implementations, every record rendered, spinner loading, call detail as a separate route not a side panel. Right scope, wrong primitives.
- `feat/twenty-shell`: Twenty's primitives and table exactly, but wrong scope (all of Twenty, no Dialer pages). Not the destination.

## Decisions so far

- [Table reads: browser to Twenty GraphQL or backend proxy](dialer-3p0j): browser calls Twenty `/graphql` + `/metadata` with the operator's OAuth token (proven, 748 prospects); carried over from the superseded map.

## Not yet specified

- Order of page migration once the shared table/side-panel primitives exist.
- Which Dialer data lives in Twenty objects vs the Dialer backend for the recording page.

## Out of scope

- Running or vendoring Twenty's full frontend (`feat/twenty-shell`, epic dialer-tr27): superseded by this map.
- Production auth hardening: bead dialer-v5lo.

## Notes

- Owner's words (2026-10-08): "made to look like 20, but operate separately from 20, using the packages for the front end, not having to do yarn"; "it's meant to literally just be a power dialer".
- Not this: vendoring/running `twenty-front` (branch `feat/twenty-shell`, epic `dialer-tr27`). That branch renders every Twenty object and its metadata; it is kept, unmerged, as reference only. Reusable from it: `docs/twenty-parity-audit.md` (token, primitive and table findings), the vendor/tamper tooling is not needed.
- Source of truth for look and patterns: `twentyhq/twenty` tag `twenty/v2.41.0` (local `REPOS/twenty`), the version node01 runs.
- Decide from Twenty source where possible; product calls go to the owner.

## Where we are against the destination (deviation snapshot)

- `main` / `frontend/`: own app with Dialer pages, but hand-rolled Tailwind `--ods-*` tokens (Tailwind palette, not Twenty's), `lucide` icons, per-page `<table>` implementations, every record rendered, spinner loading, call detail as a separate route not a side panel. Right scope, wrong primitives.
- `feat/twenty-shell`: Twenty's primitives and table exactly, but wrong scope (all of Twenty, no Dialer pages). Not the destination.

## Decisions so far

## Not yet specified

- Order of page migration once the shared table/side-panel primitives exist.
- Which Dialer data lives in Twenty objects vs the Dialer backend for the recording page.

## Out of scope

- Running or vendoring Twenty's full frontend (`feat/twenty-shell`, epic dialer-tr27): superseded by this map.
- Production auth hardening: bead dialer-v5lo.
