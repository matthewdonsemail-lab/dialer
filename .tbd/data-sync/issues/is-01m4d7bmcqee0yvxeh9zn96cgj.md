---
type: is
id: is-01m4d7bmcqee0yvxeh9zn96cgj
title: "Step 2: Byte-identity check script + CI"
kind: task
status: closed
priority: 1
version: 4
spec_path: docs/project/specs/active/plan-2026-10-08-twenty-shell.md
labels: []
dependencies:
  - type: blocks
    target: is-01m4d7bv6nd81r46zvkdxvtnb8
parent_id: is-01m4d7bj5te29e5d90g87nt3ae
created_at: 2026-10-08T07:41:31.415Z
updated_at: 2026-10-08T07:54:41.718Z
closed_at: 2026-10-08T07:54:41.717Z
close_reason: "Done: check script + 5 unit tests + CI job; real tamper detected; fixed scope/secret checks silently skipping after vendoring."
resolution: null
duplicate_of: null
---
scripts/check-twenty-vendor.mjs: blob SHA compare vs tag tree via GitHub API, allow only VENDOR.json patch paths; CI job.
