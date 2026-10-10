---
type: is
id: is-01m4dacjb4jk2b5ajd5t6m4vgb
title: Can frontend/ consume twenty-ui@2.41.0 from npm as its primitive layer?
kind: task
status: open
priority: 1
version: 2
labels:
  - wayfinder:research
dependencies:
  - type: blocks
    target: is-01m4dackjrn8e6pa45h34ac4d4
parent_id: is-01m4dabwb11k9spz81qfggjjbs
created_at: 2026-10-08T08:34:27.811Z
updated_at: 2026-10-08T08:34:32.057Z
---
## Question

twenty-ui@2.41.0 is MIT, published, ships compiled style.css + theme-light.css (--t-* tokens), Base UI + SCSS modules, Tabler icons, peers on React 19. Determine: React 18->19 upgrade impact on frontend deps (sip.js, dnd-kit, floating-ui, react-query, router 6), Tailwind preflight/--ods conflicts, bundle size, and render Button/MenuItem/Tag/Checkbox/Chip in the Dialer to prove it.
