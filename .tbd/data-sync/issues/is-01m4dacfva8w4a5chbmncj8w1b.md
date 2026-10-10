---
type: is
id: is-01m4dacfva8w4a5chbmncj8w1b
title: "Framework: move the Dialer frontend to Next.js, or keep it on Vite + React?"
kind: task
status: closed
priority: 1
version: 2
labels:
  - wayfinder:grilling
dependencies: []
parent_id: is-01m4dabwb11k9spz81qfggjjbs
created_at: 2026-10-08T08:34:25.257Z
updated_at: 2026-10-08T08:35:48.226Z
closed_at: 2026-10-08T08:35:48.226Z
close_reason: "Owner 2026-10-08: no framework or page changes. Keep main's app (pages, routes, behaviour) exactly; make it LOOK like Twenty, act like the Dialer."
resolution: null
duplicate_of: null
---
## Question

Owner mentioned converting Twenty's components into Next.js/React. frontend/ today is a Vite + React 18 SPA deployed to Vercel with a separate Express backend. Next.js vs staying on Vite changes routing, data loading and the migration size.
