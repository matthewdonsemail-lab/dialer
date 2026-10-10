---
type: is
id: is-01m4d7bk9v9kd87vreew7srvj9
title: "Step 1: Vendor Twenty v2.41.0 packages into twenty/ + relicense AGPLv3"
kind: task
status: closed
priority: 1
version: 6
spec_path: docs/project/specs/active/plan-2026-10-08-twenty-shell.md
labels: []
dependencies:
  - type: blocks
    target: is-01m4d7bmcqee0yvxeh9zn96cgj
  - type: blocks
    target: is-01m4d7bnh7qvvvgkv4dys0p539
  - type: blocks
    target: is-01m4d7bpmz81bn9ejc99xgzxfb
parent_id: is-01m4d7bj5te29e5d90g87nt3ae
created_at: 2026-10-08T07:41:30.298Z
updated_at: 2026-10-08T07:51:55.263Z
closed_at: 2026-10-08T07:51:55.262Z
close_reason: "Done on feat/twenty-shell: a2925f05 pristine vendor (13,672 blobs == tag d1bb92d1), license commit (AGPLv3 + NOTICE), workspace trim + VENDOR.json."
resolution: null
duplicate_of: null
---
Copy the six packages + root build files at d1bb92d1, VENDOR.json, LICENSE->AGPLv3, NOTICE with Twenty attribution; MIT notices kept for twenty-ui/twenty-shared.
