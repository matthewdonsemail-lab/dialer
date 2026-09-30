# Messaging: SMS threads on leads and prospects

The detail pages have a three-pane default: contact card, **Conversations**,
activity. The Conversations pane is a real SMS thread, not a draft helper:
history comes from Twenty, sending goes through Telnyx, and replies land back
in the thread by webhook.

## Where things live

| Piece | Lives in | Notes |
|---|---|---|
| Thread ledger | Twenty `agencyMessages` | one row per message, both directions; `agencyProspect` / `agencyLead` relations link it to the record (REST keys `agencyProspectId` / `agencyLeadId`) |
| Send | `POST /api/messages/send` (backend) | Telnyx `messages.send`, then writes the OUTBOUND row |
| History | `GET /api/messages?prospectId=&leadId=` | relation match, else from/to phone-pair match |
| Inbound | `frontend/api/telnyx-webhook.ts` (`message.received`) | writes the INBOUND row, links prospect/lead by phone |
| Delivery receipts | same receiver (`message.finalized`) | stamps `status` on the row by `telnyxMessageId` |
| UI | `ConversationsWidget` + `ContactCard` | thread bubbles, composer, sending-number selector, quick-command chips |

Created idempotently by `POST /api/setup/twenty` (object + six text fields +
two relations). The setup bootstrap speaks the `/metadata` endpoint — the old
`/graphql` path never worked against this instance (see twenty-troubleshooting).

## Sending rules (mirrors blaster)

Blaster (`../blaster`, standalone, same credentials) is the reference
implementation; the dialer backend applies the same precedence so both agree:

1. The sending number must be an `agencyPhones` row with a
   `messagingProfileId` — that profile wins (`bound-to-number`). Otherwise 409.
2. Else the recipient-country map (`TELNYX_MESSAGING_PROFILES`, `*_US`, `*_IE`).
3. Else the default `TELNYX_MESSAGING_PROFILE_ID` with a warning in the response.
4. Else 500: no profile configured.

Country detection is prefix-based (`+1` US, `+353` IE, `+44` GB). US numbers
need a 10DLC-registered profile; IE/GB need an alphanumeric-sender profile —
a US profile is accepted by Telnyx and then rejected by the carrier.

## Telnyx webhook wiring (inbound)

Point the numbers' **message** webhook at the deployed receiver:

```
https://<frontend>/api/telnyx-webhook?token=<TELNYX_WEBHOOK_TOKEN>
```

Without this, replies never reach the thread (sends still work). The receiver
is token-gated and idempotent per event; unmatched numbers are still logged,
just unlinked.

## Env

```env
TELNYX_API_KEY=                    # sending (backend only, never VITE_)
TELNYX_MESSAGING_PROFILE_ID=       # default profile
TELNYX_MESSAGING_PROFILE_US=       # US 10DLC profile
TELNYX_MESSAGING_PROFILE_IE=       # IE alphanumeric profile
TELNYX_MESSAGING_PROFILES=         # e.g. US=<id>,IE=<id>,GB=<id> (wins over the two above)
TELNYX_WEBHOOK_TOKEN=              # shared gate for the webhook receiver (?token=)
```

## What the dialer deliberately does not do

- Keep a second ledger: the thread is `agencyMessages`, full stop. Blaster's
  Convex ledger is blaster's; the dialer never reads or writes it.
- Require blaster running: the chat panel works with only the dialer stack up.
  Blaster stays the bulk-SMS workstation (CLI/MCP/sequences) on the same data.
