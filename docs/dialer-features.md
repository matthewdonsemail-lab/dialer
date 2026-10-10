# Dialer features: power dialer, campaigns, audio source, reports

What the dialer does today, how each part works, and the one-time setup each
needs. Modelled on WAVV's single-line dialer and reports.

## Contacts sheet

- One shared table (`frontend/src/components/table/`) used by Contacts, Call
  History and Phone Numbers. Columns are typed (title, text, phone, date,
  status, badge, custom) so the same kind of data looks and sorts the same.
- Every header has a sort and filter menu; columns can be dragged, resized
  and hidden. Columns share the screen width so the sheet fits without
  scrolling sideways at laptop size.
- Search, filters, sort and layout are saved per table in the browser.
- Contacts marked Contacted or Do Not Contact sort to the bottom.
- Edits (status, delete) apply instantly and roll back if Twenty rejects them.
- Extra phone numbers and emails stored in Twenty show as a "+N" chip on the
  contact page.

## Dispositions

The softphone uses WAVV's list, grouped Positive (Interested, Appointment Set,
Callback, Good Number, Left Callback, Left Voicemail) and Negative (Not
Interested, Bad Number, No Answer, Wrong Number, Do Not Contact). Each sets
the call status and the contact's status. The single source of truth is
`frontend/src/lib/call-outcome.ts`.

## Call campaigns and the power dialer

- Select contacts and press **Dial N selected**: a campaign is created, named
  after the date and time. Press **Campaigns** with nothing selected to see,
  resume, rename, archive or delete campaigns, with progress, statistics and
  call history per campaign.
- **Start Dialing** shows a floating dialer card over the current page (the
  screen does not change). It dials the current contact, shows who is next,
  and after **Save & Next** moves on until the list is done, then marks the
  campaign Completed. The 24-hour redial cooldown still applies.
- Campaigns are stored in Twenty (`callCampaigns`). Progress and statistics
  are derived from calls to the campaign's contacts after it was created.

## Audio source (Settings)

Settings -> Audio Source offers WAVV's three options:

| Option | How it works |
|---|---|
| Computer audio | Browser microphone and speaker; pick devices and use **Test** (level meter + chime). |
| Phone: Call me | The backend rings your phone; answering connects you for the whole session. |
| Phone: Dial in | You call the dial-in number and enter the 4-digit PIN shown on screen. |

With phone audio, your phone is one Telnyx call leg for the session. Each
contact is dialled linked to it (`link_to` + `bridge_on_answer`) and recorded
from answer. Session state lives in Twenty (`dialerAudioSessions`) because
webhooks and the browser's polls run in different serverless invocations.
The event logic is in `backend/src/lib/audioBridge/` and is unit tested.

## Reports and settings

- **Reports** (replaces the Dashboard): Overview, Number Health, Team
  Performance and Disposition Report, each with charts and the exact numbers.
- **Settings**: Appearance (light, dark, system), Audio Source, report goals
  (daily call goal, conversation length) and account.

## One-time setup

Run from `backend/` with the root `.env.local`. All scripts are safe to re-run.

1. Twenty objects for campaigns and phone audio:

   ```bash
   npx tsx --env-file=../.env.local setup-call-campaigns.ts
   npx tsx --env-file=../.env.local setup-audio-sessions.ts
   ```

2. Phone audio only: create the Telnyx Call Control application (needs a
   valid `TELNYX_API_KEY` and `TELNYX_WEBHOOK_TOKEN`), then assign a number
   to it in the Telnyx portal for Dial in:

   ```bash
   npx tsx --env-file=../.env.local setup-telnyx-call-control.ts https://dialer.listeningkit.com
   ```

3. Set `TELNYX_CALL_CONTROL_APP_ID` (printed by step 2) and
   `TELNYX_DIAL_IN_NUMBER` in Vercel and `.env.local`. The deployed
   `TELNYX_WEBHOOK_TOKEN` must match the one used in step 2. Without these,
   computer audio still works and the phone options stay disabled.
