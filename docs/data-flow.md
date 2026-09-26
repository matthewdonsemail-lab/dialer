# Data flow

How a user action becomes rows in Twenty. Read
[architecture.md](./architecture.md) first for what the three surfaces are.

Diagram: [diagrams/data-flow.mmd](./diagrams/data-flow.mmd).

## Reads

The frontend uses TanStack Query. CRM reference data gets
`staleTime: Infinity` because it changes only when a human edits it in Twenty.
Calls use 30 seconds. The phone list polls every 15 seconds because the claim
state has to look live.

There are no optimistic updates anywhere. Every mutation waits for the server
and then invalidates the query. That is a deliberate trade: it means the UI can
never show a write that the server rejected, at the cost of a round trip on
every change.

The `twentyPhones` query key is `twentyPhones`, but some pages invalidate
`twenty-phones`. That mismatch is real and means those pages do not refresh
their phone list after a call.

## Writes

Every write is a `POST`, `PATCH`, or `DELETE` through `apiClient`, which adds
`Authorization: Bearer <token>` when a token exists and otherwise relies on the
platform session. Writes are field-allow-listed per route rather than passed
through, so an unknown field is dropped instead of reaching Twenty.

The native app does the same thing one layer down: each logic function calls
`pick(body, ALLOWED)` before touching the REST client. The three phone state
functions are the exception, because they construct their PATCH body directly
in order to write the claim fields.

## Pagination

This is the thing most likely to surprise you.

The Twenty build this project targets ignores `startingAfter`, `offset`, and
`page`: all three return page 1. It also caps `limit` at 200. So cursor
pagination does not work and every list is a keyset walk over `id`:

```
GET /rest/agencyProspects
      ?limit=200
      &orderBy=id[AscNullsFirst]
      &filter=id[gt]:"<last id seen>"
```

`listTwentyPage` in `railcode/server/lib/twenty.ts` and `listTwentyAll` in
`backend/src/lib/twenty-client.ts` are the two implementations. Both are
bounded: 15 pages for leads and prospects, 50 for calls.

Because ids are unique, pages are disjoint and the walk terminates. Verified
against 741 prospects with no duplicates.

One consequence to be aware of: when the walk is on page two or later it
**replaces** the caller's filter with the `id[gt]` filter rather than combining
them. A caller-supplied filter therefore only applies to the first page.

## The phone claim lock

The claim state lives on the `agencyPhones` row, not in server memory, so it
survives a restart and every surface sees the same answer at the same time.

```
IDLE --claim--> DIALING --state(ACTIVE)--> ACTIVE
                  |                          |
                  +--------release----------+
                                    (all back to IDLE)
```

Full state machine, including the 409 and force paths, in
[diagrams/phone-claim.mmd](./diagrams/phone-claim.mmd).

## The call path

The one flow where ordering is load-bearing. Full sequence with the two fragile
steps marked: [diagrams/call-lifecycle.mmd](./diagrams/call-lifecycle.mmd).

In short: claim the number, create the call row as `IN_PROGRESS`, register over
SIP, invite, read `X-Telnyx-Call-Control-ID` off the 200 OK, stamp that id onto
the row, then start recording. On hang up, patch the final status, reconcile
against Telnyx in case the id was never captured, and release the number.

## Schema

Created by `POST /api/setup/twenty`, which is idempotent: it looks an object up
by name before creating it, and treats an `already exists` field error as
success.

That endpoint creates four objects: `agencyProspects`, `agencyLeads`,
`agencyCampaigns`, `agencyScripts`, plus the `coldCallStatus` and `utmSource`
selects and the `campaignId` relations. It does **not** create `agencyPhones`,
`agencyCalls`, `agencyOffers`, `agencyCallLogs`, or `agencyProfiles`. Those have
to exist in the workspace already.

Field-by-field reference: [diagrams/data-model.mmd](./diagrams/data-model.mmd).
One API rule worth memorising: Twenty writes relation fields as
`{fieldName}Id`, so a relation declared as `campaignId` is sent as
`campaignIdId`.
