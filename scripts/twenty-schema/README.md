# Twenty schema helpers

One-off scripts that inspect and mutate the `agency*` custom objects in the
Twenty workspace. They are the manual, incremental path; the supported
bootstrap path is the API endpoint described in
[twenty-troubleshooting.md](../twenty-troubleshooting.md).

## Tracked on purpose: no

`backend/scripts/` is gitignored. Two reasons:

1. These are one-off operators. Each one has been run once against a specific
   workspace and encodes hardcoded object and field UUIDs from that workspace.
   They are not a migration system and have no ordering or rollback story.
2. Security. `check-campaign-fields.mjs` and `check-campaign-fields.py`
   hardcode a live workspace API key. That key must be rotated before this
   directory is ever tracked, and the two files should be deleted rather than
   committed.

The supported, tracked way to create the schema is:

```
POST /api/setup/twenty
```

implemented in `backend/src/lib/twenty-object-service.ts` and mirrored in
`railcode/server/lib/setup.ts`. It is idempotent: it looks an object up by
name before creating it, and treats an `already exists` field error as success.
Use that, not these scripts.

## What is in there

Local only, for reference. All of them read `TWENTY_BASE_URL` and
`TWENTY_API_KEY`, except the two that hardcode the key.

| Script | Purpose |
|---|---|
| `list-objects.ts` | Dump every object in the workspace with its metadata id. |
| `check-fields.ts` | Dump the fields on `agencyCampaigns`. |
| `check-prospect-fields.ts` | Dump the fields on `agencyProspects`. |
| `check-prospect-campaign-field.ts` | Report what the campaign relation on `agencyProspects` is actually called. |
| `check-scripts-object.ts` | Dump the fields on `agencyScripts`. |
| `add-campaign-fields.ts` | Add `status` and `campaignType` SELECT fields. |
| `add-campaign-id-field.ts` | Add the `campaignId` relation field. |
| `add-campaign-relation-fields.ts` | Add `campaignId` relations to prospects and leads. |
| `add-cold-call-status-field.ts` | Add `coldCallStatus` to `agencyProspects`. |
| `add-cold-call-status-to-leads.ts` | Add `coldCallStatus` to `agencyLeads`. |
| `test-prospect-record.ts` | Fetch one prospect record and print the raw shape. |
| `generate-scripts-from-contents.ts` | Generate `agencyScripts` rows from `agencyContents`. |
| `generate-scripts-v2.ts` | Generate Sandler-method call scripts. |
| `check-campaign-fields.mjs` / `.py` | Hardcoded-key field dump. Delete these. |
