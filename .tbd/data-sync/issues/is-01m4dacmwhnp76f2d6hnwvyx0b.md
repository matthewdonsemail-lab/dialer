---
type: is
id: is-01m4dacmwhnp76f2d6hnwvyx0b
title: "Real-time sync: how does the Dialer get Twenty-style live updates without running twenty-front?"
kind: task
status: open
priority: 1
version: 1
labels:
  - wayfinder:research
dependencies: []
parent_id: is-01m4dabwb11k9spz81qfggjjbs
created_at: 2026-10-08T08:34:30.416Z
updated_at: 2026-10-08T08:34:30.416Z
---
## Question

twenty-front keeps a normalised record store and subscribes to Twenty's event stream (AddQueryToEventStream / sse-db-event) over /metadata. Determine whether the Dialer can subscribe to the same stream with the operator's OAuth token, what the protocol is, and the store shape to replicate, versus polling or Twenty webhooks.
