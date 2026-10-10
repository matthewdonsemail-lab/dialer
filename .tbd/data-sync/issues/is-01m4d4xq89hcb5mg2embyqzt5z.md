---
type: is
id: is-01m4d4xq89hcb5mg2embyqzt5z
title: "License: port twenty-front verbatim (relicense AGPLv3) or reimplement it on MIT twenty-ui?"
kind: task
status: closed
priority: 1
version: 3
spec_path: docs/twenty-parity-audit.md
labels:
  - wayfinder:grilling
dependencies:
  - type: blocks
    target: is-01m4d4xvz25n6jh5mvd0rtrzdw
parent_id: is-01m4d4x6hvs6gtgptbbfy0fdvt
created_at: 2026-10-08T06:58:58.441Z
updated_at: 2026-10-08T07:01:38.305Z
closed_at: 2026-10-08T07:01:38.305Z
close_reason: "Owner decision 2026-10-08: byte-for-byte parity is the goal; licensing is not a constraint. Port twenty-front v2.41.0 source verbatim (record table, view bar, show page, nav drawer) with attribution; consume twenty-ui/twenty-shared as-is. Consequence: repo LICENSE changes to AGPLv3 in the same commit as the first ported twenty-front file."
resolution: null
duplicate_of: null
---
## Question

twenty-front (record table, view bar, show page, nav drawer) is AGPLv3; twenty-ui and twenty-shared are MIT; this repo is MIT. Byte-for-byte parity of the table requires copying twenty-front. Options: (A) keep MIT — consume twenty-ui/twenty-shared directly, reimplement twenty-front behaviour against its documented constants/behaviour; (B) relicense the dialer to AGPLv3 and port twenty-front source verbatim with attribution. Owner/legal call.
