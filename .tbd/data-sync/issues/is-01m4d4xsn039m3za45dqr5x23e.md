---
type: is
id: is-01m4d4xsn039m3za45dqr5x23e
title: "Where should table reads come from: browser→Twenty GraphQL with the operator's OAuth token, or backend proxy?"
kind: task
status: closed
priority: 1
version: 4
spec_path: docs/twenty-parity-audit.md
labels:
  - wayfinder:research
dependencies:
  - type: blocks
    target: is-01m4d4xvz25n6jh5mvd0rtrzdw
  - type: blocks
    target: is-01m4d4xx4ptqn8dxw497y9e0zh
parent_id: is-01m4d4x6hvs6gtgptbbfy0fdvt
created_at: 2026-10-08T06:59:00.896Z
updated_at: 2026-10-08T07:06:48.280Z
closed_at: 2026-10-08T07:06:48.279Z
close_reason: "Resolved 2026-10-08 (live probe from https://dialer.listeningkit.com page context, prod Twenty v2.41): the operator's OAuth access token (type APPLICATION_ACCESS but user-bound: userId+userWorkspaceId) is accepted as Authorization: Bearer on twenty /graphql and /metadata cross-origin. Verified: metadata currentUser, objects(paging) with icons, agencyProspects(first) with totalCount=748 + cursor pageInfo. Views are on /metadata (getViews/getView), not /graphql. twenty-front v2.41 Apollo is cookie-only (credentials:'include', SameSite=Lax __Host-twenty-session, unusable cross-site) BUT ApolloFactory merges optionHeaders into every request. DECISION: table/record reads go browser -> Twenty GraphQL/metadata directly through vendored twenty-front Apollo with optionHeaders {Authorization: Bearer <operator token>}; refresh via existing /api/oauth/refresh. Backend proxy stays only for Dialer-owned writes (calls, recordings, Telnyx)."
resolution: null
duplicate_of: null
---
## Question

Twenty-front queries findMany with limit/offset + totalCount directly. The operator already holds a Twenty access token (scope api) after sign-in. Determine: does Twenty v2.41 /graphql accept that token from the dialer origin (CORS, guard exemption), does it carry the operator's permissions, and what the backend proxy would cost instead (Vercel latency, API-key over-privilege). Decide the transport for the record table.
