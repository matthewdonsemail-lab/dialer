---
type: is
id: is-01m4d4xttb15dnk0gndshe3f0y
title: Retire the legacy record shape (map-prospect) and use metadata field names everywhere?
kind: task
status: closed
priority: 1
version: 3
spec_path: docs/twenty-parity-audit.md
labels:
  - wayfinder:research
dependencies:
  - type: blocks
    target: is-01m4d4xvz25n6jh5mvd0rtrzdw
parent_id: is-01m4d4x6hvs6gtgptbbfy0fdvt
created_at: 2026-10-08T06:59:02.091Z
updated_at: 2026-10-08T07:07:00.367Z
closed_at: 2026-10-08T07:07:00.366Z
close_reason: "Resolved 2026-10-08. Legacy Supabase-era shape is produced by backend mappers (routes/prospects/helpers/map-prospect.ts mapProspectListItem/Detail/UpdateResult, routes/leads/helpers/map-lead.ts mapLeadToFrontend, calls/map-call, campaigns/map-campaign, scripts/map-script) and consumed by frontend types/database.ts, ProspectPage, ProspectDetailPage, LeadsPage, LeadDetailPage, CallHistoryPage, CallDetailPage, LeadForm, Softphone, SendWebsiteWidget, Layout; backend call-logs payload, notify, twenty webhook, lead notify formatter. DECISION: the UI adopts raw Twenty metadata field names + record ids (agencyProspects.name/region/coldCallStatus/campaignId...) because vendored twenty-front record index/show read records straight from Twenty GraphQL. Record table/show pages stop using mappers immediately; Dialer extensions (Softphone, SendWebsiteWidget, call logging) are migrated to take a Twenty record (ObjectRecord) instead of the mapped type, then map-prospect/map-lead/types/database.ts are deleted. Backend-only consumers (notify, webhook, call-logs payload) keep server-side mapping until their own beads."
resolution: null
duplicate_of: null
---
## Question

Backend maps agencyProspects/leads to a Supabase-era shape (first_name, company<-niche, state<-region); UI maps back via PROSPECT_FIELD_FOR_KEY. List every consumer of the mapped shape (pages, softphone, call logs, campaigns, website widget, AI analysis), and decide whether the frontend switches to raw Twenty field names + objectMetadataItems.
