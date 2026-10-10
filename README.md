<p align="center">
  <img src="banner.png" alt="Dialer" width="100%">
</p>

# dialer

**A power dialing softphone CRM that works the same way as the GoHighLevel
dialer and the WAVV dialer: open source, in your browser, with every record
kept in [Twenty CRM](https://twenty.com).**

Built by [Matthew](https://github.com/matthewdonsemail-lab)
([@matthewsoldit on X](https://x.com/matthewsoldit)). Need telephony working
with your CRM? [Talk to Matthew on X](https://x.com/matthewsoldit).

[![License: MIT](https://img.shields.io/badge/LICENSE-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org/)
[![Twenty CRM](https://img.shields.io/badge/CRM-Twenty-000000.svg)](https://twenty.com)
[![Telnyx](https://img.shields.io/badge/voice-Telnyx-00c08b.svg)](https://telnyx.com)

<p align="center">
  <img src="docs/screenshots/contact-website.png" alt="A contact: details and people, the call timeline, and the website and video panel" width="100%">
</p>

Load a list, press call, and the dialer works through it: the script appears
next to the call, the call is recorded and transcribed, an AI rates it, and
one click on a disposition moves the contact on and dials the next. It is the
power dialing workflow agencies pay a monthly fee per seat for, rebuilt in the
open on top of Twenty, so you own the data and the code.

## Why it works

- **It works the moment you connect it.** There is no database to provision.
  Every prospect, lead, call, script, number and dial list is a custom object
  in your Twenty workspace, created by one command. The servers here only
  translate between the browser and the Twenty API, so there is nothing to
  migrate, back up or keep in sync.
- **The phone is in the browser.** SIP over WebRTC straight to Telnyx, with
  one registered agent per session, so inbound calls ring while you work.
  Hold, mute, keypad, notes and the script all live in a floating dialer that
  follows you around the app.
- **Power dialing, like WAVV.** Select contacts, start a dial list, and work it
  in order: the queue shows now and next, every call is logged, and a
  disposition advances the list.
- **Every call is reviewed.** Telnyx records server-side, the transcript lands
  on the call row by webhook, and an AI writes a summary, key points, a 0-100
  score and five quality ratings, visible in the dialer and in Twenty itself.
- **Two agents can never dial from the same number.** The number lock lives on
  the Twenty record, so it holds across servers, restarts and every surface.
- **State cannot go wrong.** Contact status, outreach, video, call result, dial
  lists and offers are state machines shared by the screens and the server, so
  a refused move (calling a do-not-contact, texting a number that cannot
  receive from yours) is refused in both places, with a reason.
- **Everything is guarded.** AST checks run on every commit; the full type
  check, tests and build run on every push. A button that does nothing, a
  toggle that hides its state or a hard-coded status cannot be committed.

## Screenshots

Every page and tab, in light mode, from the demo workspace (no real data).
The full set is in [docs/screenshots](docs/screenshots/README.md).

| | |
|---|---|
| ![Reports](docs/screenshots/reports-overview.png) | ![Contacts](docs/screenshots/contacts.png) |
| **Reports**: calls, conversations, talk time, goal per member | **Contacts**: prospects and leads, paged and filtered on the server |
| ![Live call](docs/screenshots/dialer-live-script.png) | ![After the call](docs/screenshots/dialer-summary.png) |
| **The dialer**: a live call with the campaign script beside it | **After the call**: one click on a disposition, then the next |
| ![Call review](docs/screenshots/call-ai.png) | ![Admin](docs/screenshots/admin-activity.png) |
| **Call review**: AI summary, key points and quality ratings | **Admin**: every create, update and delete, by member |

## Run your own in five commands

You need [Bun](https://bun.sh), Node 20+, a [Twenty](https://twenty.com)
workspace (cloud or self-hosted) with an API key, and a
[Telnyx](https://telnyx.com) SIP connection for calls.

```bash
git clone https://github.com/matthewdonsemail-lab/dialer.git && cd dialer
bun run install:all
cp .env.example .env.local        # TWENTY_BASE_URL, TWENTY_API_KEY, JWT_SECRET, Telnyx
bun run twenty:schema             # creates every object, field and relation in Twenty
bun run twenty:seed               # optional: the demo workspace from the screenshots
bun run dev                       # backend :4000, frontend :5173
```

- `twenty:schema` is additive and safe to re-run: it creates what is missing
  and never edits or deletes. `bun run twenty:schema:check` is the dry run.
- `twenty:seed` loads 24 fictional businesses, 48 calls (one with a full
  transcript and AI review), scripts, numbers and dial lists. It refuses to
  write to a workspace that already has real prospects, and
  `bun run twenty:seed -- --reset` removes it again.
- Sign in with your Twenty account (OAuth). The full reference is in
  [SETUP.md](SETUP.md).

## How it was built

Matthew built this to run his own agency's outbound calling on Twenty instead
of renting a dialer seat per rep. The dialers it is modelled on keep your
calls in their own system; this one writes every call, recording link,
transcript and rating onto the Twenty record, where the rest of the CRM can
use it.

The latest round of work, all in this repository's history:

- **A contact workspace in the style of the GoHighLevel contact page.** Details
  and the people at the business on the left, one timeline of calls, notes and
  changes in the middle, and panels for the call summary, record history,
  script, notes, and the website and video sent to the prospect.
- **A global dialer dock.** One floating dialer with recents, contacts, keypad,
  queue, a live-call view with notes and the script, and an after-call summary.
- **Readable record history**, modelled on HubSpot, Close, Attio and Zoho:
  "Status changed from Contacted to Interested", never raw JSON.
- **One prospect page per business** on a canonical offer URL, with a live
  preview, and a same-country rule so a number never texts a country it
  cannot reach.
- **Shared state machines** for every pipeline field, used by both the API
  and the screens.
- **A design system** with one type scale, one radius scale, Font Awesome 6
  icons and page-shaped loading skeletons, enforced by a pre-commit check.
- **A failure map**: every create, update and delete reports its failure in
  words (see [docs/feedback-map.md](docs/feedback-map.md)), with no silent errors.
- **A whole-repo move** to a camelCase `domains/<domain>/<primitive>` layout,
  done by an AST codemod and enforced on every commit.
- **Open-source setup**: the one-command Twenty schema, the demo seed, and the
  screenshot capture that produced every image in this README.

---

## Contents

- [Why it works](#why-it-works)
- [Screenshots](#screenshots)
- [Run your own in five commands](#run-your-own-in-five-commands)
- [How it was built](#how-it-was-built)
- [The workflow](#the-workflow)
- [What it does](#what-it-does)
- [The three surfaces](#the-three-surfaces)
- [Architecture](#architecture)
- [Data flow](#data-flow)
- [The call](#the-call)
- [Data model](#data-model)
- [Running it](#running-it)
- [Configuration](#configuration)
- [Production authentication](#production-authentication)
- [Repository layout](#repository-layout)
- [API reference](#api-reference)
- [Documentation map](#documentation-map)
- [Checks](#checks)
- [License](#license)

---

## The workflow

Two ways to work, depending on whether you need the browser softphone.

### A. Calling from the dialer

Needs a softphone, so this is the standalone path (`frontend/` or `railcode/`).
The browser holds the SIP call itself.

1. **Open a lead or prospect.** The script for its campaign loads next to the
   dialer, with its objection handling.
2. **Claim a number.** `POST /phones/:id/claim` moves it `IDLE` to `DIALING`. If
   another member holds it you get a 409 naming them, and the dial aborts
   before any SIP traffic.
3. **Dial.** The call row opens as `IN_PROGRESS` *before* the INVITE, so a call
   that fails to connect is still on record.
4. **Talk.** Hold, mute and redial from the softphone. Telnyx is already
   recording server-side from the moment it connects.
5. **Save a disposition.** One action patches the call status, runs the
   recording reconcile, releases the number, and moves the prospect or lead
   status.
6. **Review.** The recording and transcript are on the call row, attached by
   webhook a few seconds after you hang up. Play them from call history.

### B. Logging inside Twenty

The native app has no softphone, so you call from your own handset and write the
result back. No second login, no extra host.

1. **Open the Queue tab** - prospects with their current status.
2. **Call from your own handset.**
3. **Log the call inline** - select rows, set the outcome, and it creates the
   `agencyCalls` row for you.
4. **Claim a number** only if you are also sending an SMS or a website link.

Both paths read and write the same six objects, so status carries forward in
either direction. A prospect that showed interest becomes a lead, and the
script and the offer follow it.

<!-- mermaid:agent-workflow.mmd -->
```mermaid
flowchart TB
    subgraph pathA ["A - calling from the dialer"]
        direction TB
        A1["Open a lead or prospect<br/>the script for its campaign loads next to the dialer"]
        A2["Claim a number<br/>POST /phones/:id/claim<br/>IDLE to DIALING, 409 if someone holds it"]
        A3["Dial<br/>SIP INVITE from the browser<br/>call row opens as IN_PROGRESS"]
        A4["Talk<br/>hold, mute, redial<br/>Telnyx is already recording"]
        A5["Save a disposition<br/>patch status, reconcile the recording,<br/>release the number"]
        A6["Review<br/>play the recording, read the transcript,<br/>update the prospect or lead status"]
        A1 --> A2 --> A3 --> A4 --> A5 --> A6
    end

    subgraph pathB ["B - logging inside Twenty"]
        direction TB
        B1["Open the Queue tab<br/>prospects with their current status"]
        B2["Call from your own handset<br/>the native app has no softphone"]
        B3["Log the call inline<br/>select rows, set the outcome,<br/>create the agencyCalls row"]
        B4["Claim a number only if you<br/>are sending SMS or a website link"]
        B1 --> B2 --> B3 --> B4
    end

    A6 -.->|"status carries forward"| B1
    B3 -.->|"becomes a lead when it sticks"| A1

    shared[("Shared state in Twenty<br/>agencyProspects agencyLeads agencyCalls<br/>agencyPhones agencyCampaigns agencyScripts")]
    A5 --> shared
    A6 --> shared
    B3 --> shared
    B4 --> shared

    note["The claim lock is the only thing preventing<br/>two agents dialing out of the same number.<br/>It lives on the agencyPhones row, so it holds<br/>across servers, restarts and all three surfaces."]
    A2 -.-> note
    B4 -.-> note

    classDef store fill:#eef2ff,stroke:#4f46e5,color:#1e1b4b
    classDef note fill:#fffbeb,stroke:#d97706,color:#451a03
    class shared store
    class note note
```

> Source: [`docs/diagrams/agent-workflow.mmd`](docs/diagrams/agent-workflow.mmd).

| | |
|---|---|
| ![A contact with its call summary](docs/screenshots/contact-summary.png) | ![A live call with notes](docs/screenshots/dialer-live-notes.png) |
| A contact with its call summary | A live call with notes |

The claim lock is the only thing stopping two agents dialing out of the same
number. It lives on the `agencyPhones` row rather than in server memory, so it
holds across servers, restarts, and all three surfaces. Read
[architecture.md](docs/architecture.md) before changing it: it is also the
thinnest security in the codebase.

## What it does

- **Browser softphone.** SIP over WebRTC, dial from any contact, hold, mute,
  keypad, notes, redial, and take inbound calls. Or bridge the call to your own
  phone (Settings, Audio Source) when the browser has no headset.
- **Power dialing.** Select contacts and start a dial list (a `callCampaign` in
  Twenty). The dock's queue shows now and next; a disposition moves on.
- **A floating dialer dock.** Recents, contacts, keypad and queue when idle; a
  live view with notes and the campaign script during a call; an after-call
  summary with every disposition one click away. Pin it open or let it close.
- **Number locking.** One member holds a number for the duration of a call, so
  two agents cannot dial from the same line. Enforced in Twenty, so it holds
  across servers and restarts.
- **Recording, transcript and AI review.** Started server-side through Telnyx
  Call Control, attached to the call row by webhook, then rated by any
  OpenAI-compatible model: summary, key points, 0-100 score, sentiment and five
  1-5 quality ratings.
- **A contact workspace.** Details and the people at the business, one timeline
  of calls, notes and readable record history, and panels for the call summary,
  the script, notes, and the website and video sent to the prospect.
- **Website and SMS outreach.** One prospect page per business, previewed in the
  app, sent by SMS from a number in the same country as the contact.
- **Reports and admin.** Calls, conversations, talk time and goal per member;
  number health; dispositions; and an activity log of every change, by member.
- **Runs inside Twenty.** A native app gives an agent the queue, the numbers and
  the call log without a second login.

## The three surfaces

Same product, same six objects, three independent code paths. None calls
another.

| | Directory | Server | Use it for |
|---|---|---|---|
| Standalone | `frontend/` + `backend/` | Express on `:4000` | the softphone, Telnyx, recording |
| Workspace | `railcode/` | Hono on Railcode | a private, org-only deployment |
| Native | `twenty-native-app/` | none, runs inside Twenty | dialing without a second host |

The native app is the newest and the direction of travel. The standalone path
is the only one with a real softphone: the native app does not implement
SIP/WebRTC, recording, or audio playback.

`railcode/` is a hand-maintained port of `frontend/`. The softphone is
byte-identical between them; when you fix a bug in one, expect to apply it in
the other.

<!-- mermaid:integration-paths.mmd -->
```mermaid
flowchart TB
    subgraph pathA ["Path A - the repo hosts a server"]
        direction TB
        spa["frontend/<br/>Vite SPA, browser softphone"]
        express["backend/<br/>Express on :4000<br/>JWT_SECRET, bcrypt"]
        hono["railcode/<br/>Hono worker on Railcode<br/>org connector, no API key in the worker"]
        spa -->|"VITE_API_URL, or same-origin"| express
        hono -.->|"same UI, different base URL"| spa
    end

    subgraph pathB ["Path B - the dialer runs inside Twenty"]
        direction TB
        widget["DialerApp front component<br/>Remote-DOM sandbox, 5 tabs"]
        apilayer["front-components/dialer/api.ts<br/>RestApiClient"]
        logic["33 logic functions<br/>/dialer/*<br/>isAuthRequired, 15s timeout"]
        client["lib/dialer-client.ts<br/>lazy RestApiClient + MetadataApiClient"]
        widget --> apilayer --> logic --> client
    end

    keyA["Auth: the repo's own JWT, or the Railcode platform session.<br/>Twenty is called with a static workspace API key."]
    keyB["Auth: the Twenty workspace session.<br/>TWENTY_APP_ACCESS_TOKEN, refreshed on 401."]

    express --> keyA
    hono --> keyA
    client --> keyB

    hop1{{"Hop 1: /s/dialer/*<br/>functions host"}}
    hop2{{"Hop 2: /rest/agency*<br/>record host"}}
    apilayer -->|"RestApiClient, path starts with /s/<br/>routes to TWENTY_FUNCTIONS_URL"| hop1
    logic --> hop1
    logic --> hop2
    client --> hop2

    express --> store
    hono --> store
    hop2 --> store[("Twenty records<br/>agencyProspects agencyLeads agencyCampaigns<br/>agencyScripts agencyPhones agencyCalls")]

    onlyB["Only Path A has: SIP/WebRTC softphone,<br/>Telnyx record_start and reconcile,<br/>audio proxy, call logs, profiles,<br/>CSV import, schema bootstrap, offers"]
    onlyA["Only Path B has: in-workspace UI,<br/>no second login, no extra host"]

    express -.-> onlyB
    logic -.-> onlyA

    classDef hop fill:#fdf4ff,stroke:#a21caf,color:#4a044e
    classDef note fill:#fffbeb,stroke:#d97706,color:#451a03
    class hop1,hop2 hop
    class onlyA,onlyB,keyA,keyB note
```

> Source: [`docs/diagrams/integration-paths.mmd`](docs/diagrams/integration-paths.mmd).
> It records what only each path can do, which is the question this repository
> gets asked most.

| | |
|---|---|
| ![Sign in with Twenty](docs/screenshots/login.png) | ![Settings: audio source](docs/screenshots/settings-audio.png) |
| Sign in with Twenty | Settings: audio source |

## Architecture

<!-- mermaid:system-context.mmd -->
```mermaid
flowchart TB
    actor["Agent<br/>a sales rep on a desk"]

    subgraph surfaces ["Deployment surfaces (pick one or run several)"]
        direction TB
        native["Twenty native app<br/>twenty-native-app/<br/>in-workspace page + 33 logic functions"]
        spa["Standalone SPA<br/>frontend/<br/>Vite + React, browser softphone"]
        api["Express API<br/>backend/<br/>port 4000, JWT auth"]
        worker["Railcode worker<br/>railcode/<br/>Hono, platform session"]
        hook["Webhook receiver<br/>frontend/api/telnyx-webhook.ts<br/>Vercel serverless"]
    end

    subgraph twenty ["Twenty CRM (system of record)"]
        objects["agency* custom objects<br/>prospects, leads, campaigns,<br/>scripts, phones, calls"]
        meta["Metadata API<br/>SELECT options, schema bootstrap"]
        rest["REST API<br/>/rest/agency*"]
        pg[("Postgres<br/>core.user<br/>password check only")]
    end

    telnyx["Telnyx<br/>SIP trunk + Call Control<br/>recording + transcription"]

    actor --> native
    actor --> spa
    actor --> worker

    spa -->|"HTTPS /api/*"| api
    worker -->|"HTTPS /api/*"| worker
    spa <-->|"WSS SIP over WebRTC"| telnyx

    api -->|"Bearer API key"| rest
    worker -->|"org connector 'twenty'"| rest
    native -->|"logic functions"| rest
    api --> meta
    worker --> meta
    native --> meta

    api -->|"bcrypt verify"| pg
    hook -->|"Bearer API key"| rest
    telnyx -.->|"webhook events"| hook

    classDef ext fill:#f4f4f5,stroke:#71717a,color:#18181b
    classDef store fill:#eef2ff,stroke:#4f46e5,color:#1e1b4b
    class telnyx,actor ext
    class objects,pg store
```

> Source: [`docs/diagrams/system-context.mmd`](docs/diagrams/system-context.mmd).

| | |
|---|---|
| ![Reports: team performance](docs/screenshots/reports-team.png) | ![Admin: overview](docs/screenshots/admin-overview.png) |
| Reports: team performance | Admin: overview |

Read [docs/architecture.md](docs/architecture.md) for the route tables, the
auth model, and the places where the security is thinner than it looks.

## Data flow

<!-- mermaid:data-flow.mmd -->
```mermaid
flowchart TB
    UI["Agent clicks<br/>a record, a number, or the dial button"]

    subgraph read ["Read path"]
        direction LR
        hooks["React Query hooks<br/>staleTime: Infinity for CRM data,<br/>30s for calls, 15s poll for phones"]
        client["apiClient<br/>VITE_API_URL or same-origin"]
        hooks --> client
    end

    client -->|"GET /api/leads<br/>GET /api/prospects<br/>GET /api/campaigns<br/>GET /api/scripts<br/>GET /api/twenty/phones<br/>GET /api/calls"| servers

    subgraph servers ["Server (exactly one of these)"]
        direction TB
        express["Express routers<br/>backend/src/routes/*<br/>authMiddleware, JWT"]
        hono["Hono worker<br/>railcode/server/index.ts<br/>ctx.user, platform session"]
        logic["Logic functions<br/>twenty-native-app/src/logic-functions/*<br/>isAuthRequired, 15s timeout"]
    end

    servers -->|"listTwentyAll / listTwentyPage<br/>keyset walk, id strictly ascending"| walk["Twenty REST<br/>orderBy=id[AscNullsFirst]<br/>filter=id[gt]:lastId, limit 200/page"]

    subgraph write ["Write path"]
        direction LR
        mutate["useMutation / api.* directly<br/>no optimistic updates:<br/>onSuccess then invalidateQueries"]
    end

    mutate -->|"POST / PATCH / DELETE /api/*"| servers
    servers -->|"createTwenty / updateTwenty / deleteTwenty<br/>field allow-list per route"| rest["Twenty REST<br/>/rest/agency*"]

    walk --> rest
    rest --> store[("Twenty records")]

    note["Keyset pagination note:<br/>this Twenty build ignores startingAfter,<br/>offset and page, and caps limit at 200,<br/>so every list walks id ascending."] -.-> walk

    classDef note fill:#fffbeb,stroke:#d97706,color:#451a03
    class note note
```

> Source: [`docs/diagrams/data-flow.mmd`](docs/diagrams/data-flow.mmd).

| | |
|---|---|
| ![Contacts, paged on the server](docs/screenshots/contacts.png) | ![Call history](docs/screenshots/history.png) |
| Contacts, paged on the server | Call history |

The one thing to know: this Twenty build ignores `startingAfter`, `offset` and
`page`, and caps `limit` at 200. Cursor pagination does not work, so every list
is a keyset walk over `id`, ascending, 200 per page, bounded.

```
GET /rest/agencyProspects
      ?limit=200
      &orderBy=id[AscNullsFirst]
      &filter=id[gt]:"<last id seen>"
```

More on this, and on the read and write paths, in
[docs/data-flow.md](docs/data-flow.md).

## The call

<!-- mermaid:call-lifecycle.mmd -->
```mermaid
sequenceDiagram
    autonumber
    participant A as Agent
    participant SP as Dialer (components/dialer)
    participant API as API (Express / Hono)
    participant TW as Twenty CRM
    participant TX as Telnyx
    participant AI as AI (OpenAI-compatible)

    A->>SP: press dial (phone = GET /api/twenty/phones/primary row)
    Note over SP,API: one canonical agency number from agencyPhones -<br/>no hardcoded caller id, no per-call pool picks
    SP->>API: POST /api/twenty/phones/:id/claim {memberId}
    API->>TW: PATCH agencyPhones callState=DIALING, claimedBy*
    API-->>SP: 200, or 409 heldBy when another member holds it
    Note over SP,API: a 409 aborts the dial before any SIP traffic

    SP->>API: POST /api/calls (IN_PROGRESS, from, to, agencyPhoneId, agencyProspectId or agencyLeadId)
    API->>TW: POST /rest/agencyCalls
    API-->>SP: call row id

    SP->>API: GET /api/netcheck?host&port
    Note over SP,API: best effort, a failure only warns and the dial proceeds

    Note over SP,TX: one sip.js agent per signed-in session, already<br/>REGISTERed at login, so inbound calls ring while idle
    SP->>SP: getUserMedia audio
    SP->>TX: INVITE sip:target@domain, P-Asserted-Identity header

    TX-->>SP: 200 OK
    Note over SP,TX: STEP 1 of 2 - read X-Telnyx-Call-Control-ID<br/>in inviter.invite requestDelegate.onAccept.<br/>The Inviter constructor delegate does not fire this in sip.js 0.21.

    SP->>API: PATCH /api/calls/:id {telnyxCallId}
    Note over SP,API: STEP 2 of 2 - stamp the id BEFORE /record,<br/>otherwise /record reads a row with no telnyxCallId and 400s

    SP->>API: POST /api/calls/:id/record
    API->>TX: calls.actions.startRecording {mp3, dual, transcription:true}
    TX-->>API: recording_id
    API->>TW: PATCH agencyCalls telnyxRecordingId, transcriptionStatus=PENDING
    API-->>SP: ok

    TX-->>SP: SIP 200, media flowing
    SP->>API: POST /api/twenty/phones/:id/state {memberId, state:ACTIVE}
    API->>TW: PATCH agencyPhones callState=ACTIVE

    TX-->>SP: call.recording.saved
    TX-->>SP: call.recording.transcription.saved
    Note over TX,SP: delivered to the webhook receiver, not the API.<br/>receiver PATCHes recordingUrl then transcript + transcriptionStatus=READY

    TX->>API: POST /api/webhooks/telnyx?token= (or Vercel /api/telnyx-webhook?token=)
    Note over TX,API: same contract both surfaces:<br/>token-gated, 200 on unknown events, 500 only on real errors (Telnyx retries)
    API->>TW: PATCH agencyCalls telnyxRecordingId/recordingUrl, transcriptionStatus=PENDING
    API->>TW: PATCH agencyCalls transcript, transcriptionStatus=READY
    API->>AI: chat/completions {transcript} (single OPENAI-compatible key)
    AI-->>API: {summary, sentiment, score 0-100, keyPoints, confidence}
    API->>TW: PATCH agencyCalls aiSummary/aiSentiment/aiScore/aiKeyPoints/aiConfidence/aiModel/aiAnalyzedAt (+summary mirror)
    Note over API,TW: every call row carries its own rating -<br/>no side tables, visible in Twenty CRM directly

    A->>SP: hang up
    SP->>TX: BYE
    SP->>API: PATCH /api/calls/:id {status, endedAt, durationSeconds, telnyxCallId, debugLog}
    API->>TW: PATCH agencyCalls

    A->>SP: save disposition
    SP->>API: PATCH /api/calls/:id {status}
    SP->>API: POST /api/calls/:id/reconcile
    Note over SP,API: repair path. Matches a Telnyx recording by<br/>from/to within a 15 minute window when the<br/>call-control-id was never captured.
    SP->>API: POST /api/twenty/phones/:id/release {memberId, callId}
    API->>TW: PATCH agencyPhones callState=IDLE, claimedBy* cleared

    A->>SP: play recording
    SP->>API: GET /api/calls/:id/audio
    API->>TX: recordings.retrieve(telnyxRecordingId)
    TX-->>API: download_urls.mp3 (expires in about 10 minutes)
    API-->>SP: 302 to the fresh URL
    Note over API,TX: the Telnyx API key never leaves the server

    A->>SP: analyze (or auto after transcription webhook)
    SP->>API: POST /api/calls/:id/analyze
    API->>AI: chat/completions {transcript}
    AI-->>API: {summary, sentiment, score, keyPoints, confidence}
    API->>TW: PATCH agencyCalls ai* fields (+summary mirror)
    API-->>SP: ok + analysis - Rating column shows score/sentiment
```

> Source: [`docs/diagrams/call-lifecycle.mmd`](docs/diagrams/call-lifecycle.mmd).

| | |
|---|---|
| ![Recording and transcript](docs/screenshots/call-recording.png) | ![AI review](docs/screenshots/call-ai.png) |
| Recording and transcript | AI review |
| ![Technical: the SIP trail](docs/screenshots/call-technical.png) | ![A live call with the script](docs/screenshots/dialer-live-script.png) |
| Technical: the SIP trail | A live call with the script |

Two steps in that sequence are load-bearing, and both have broken the recording
before:

1. The Telnyx call-control id has to be read in the `requestDelegate` passed to
   `inviter.invite()`. The `Inviter` constructor delegate does not fire
   `onAccept` in sip.js 0.21.
2. That id has to be stamped onto the row with a `PATCH` **before**
   `POST /api/calls/:id/record`, because `/record` re-reads the row and returns
   400 when `telnyxCallId` is empty.

`POST /api/calls/:id/reconcile` is the repair path when the id was never
captured: it matches a Telnyx recording by from and to within a 15 minute
window.

Telnyx download URLs expire in about ten minutes, so `GET /api/calls/:id/audio`
re-resolves a fresh URL and 302s to it. The API key never leaves the server.

### The number lock

<!-- mermaid:phone-claim.mmd -->
```mermaid
stateDiagram-v2
    direction LR
    [*] --> IDLE

    IDLE --> DIALING: POST /phones/:id/claim<br/>writes callState=DIALING,<br/>claimedByMemberId, claimedByEmail, claimedAt
    note right of IDLE
        claim is refused with 409
        when callState is not IDLE and
        the holder is a different member.
        The 409 body carries heldBy.
    end note

    DIALING --> DIALING: re-claim by the same member<br/>idempotent, refreshes claimedAt
    DIALING --> ACTIVE: POST /phones/:id/state {ACTIVE}<br/>fired on SIP Established
    DIALING --> IDLE: POST /phones/:id/release<br/>on hang up, on failure, on unmount
    DIALING --> IDLE: POST /phones/:id/release {force:true}<br/>admin override, skips the holder check

    ACTIVE --> DIALING: POST /phones/:id/state {DIALING}
    ACTIVE --> IDLE: POST /phones/:id/release

    IDLE --> [*]

    note left of DIALING
        release writes currentCallId so the
        number still points at the call it
        was last used for.
    end note
```

> Source: [`docs/diagrams/phone-claim.mmd`](docs/diagrams/phone-claim.mmd).

| | |
|---|---|
| ![Phone numbers with their claim state](docs/screenshots/phone-numbers.png) | ![Reports: number health](docs/screenshots/reports-numbers.png) |
| Phone numbers with their claim state | Reports: number health |

The claim state lives on the `agencyPhones` row in Twenty rather than in server
memory, so it survives a restart and every surface sees the same answer. The
full state machine, including the 409 and `force` paths, is in the diagram.

## Data model

<!-- mermaid:data-model.mmd -->
```mermaid
erDiagram
    agencyCampaigns ||--o{ agencyProspects : "campaignIdId"
    agencyCampaigns ||--o{ agencyLeads : "campaignIdId"
    agencyCampaigns ||--o{ agencyScripts : "campaignIdId"
    agencyCampaigns ||--o{ agencyOffers : "urlKey, industryId"

    agencyPhones ||--o{ agencyCalls : "agencyPhoneId"
    agencyProspects ||--o{ agencyCalls : "agencyProspectId"
    agencyLeads ||--o{ agencyCalls : "agencyLeadId"
    agencyProspects ||--o{ agencyPeople : "prospectId"
    agencyPeople ||--o{ agencyLeads : "personId"
    agencyProspects ||--o| agencyLeads : "agencyProspectId"

    agencyLeads ||--o{ agencyCallLogs : "leadId, legacy"

    agencyCampaigns {
        text name
        select status "ACTIVE INACTIVE DRAFT"
        select campaignType "OUTBOUND INBOUND BLENDED REFERRAL COLD_CALL WEBSITE TWENTY_IMPORT OTHER"
        text note "JSON settings blob"
        text utmSource
        text industryId
        text urlKey
        text funnelBaseUrl
        text templateBaseUrl
    }

    agencyProspects {
        text name
        text phone
        text email
        text website
        text fullAddress
        text city
        text region
        text country
        text niche
        number rating
        number reviewCount
        select coldCallStatus "NEW CONTACTED INTERESTED NOT_INTERESTED CALLBACK CONVERTED DO_NOT_CONTACT"
        text outboundState
        text outboundLabel
        text utmSource
        text campaignIdId "relation to agencyCampaigns"
    }

    agencyLeads {
        text name
        text contactName
        text email
        text phone
        text company
        text source
        text status
        text note
        select coldCallStatus
        text createdById
        text campaignIdId "relation to agencyCampaigns"
    }

    agencyScripts {
        text name
        text scriptData "JSON: script body plus objection responses"
        text campaignIdId "relation to agencyCampaigns"
    }

    agencyPhones {
        text phoneNumber "E.164"
        text name
        text countryCode "ISO alpha-2"
        select numberType "LONG_CODE TOLL_FREE SHORT_CODE"
        select state "ACTIVE PAUSED DEGRADED RETIRED"
        text messagingProfileId
        select callState "IDLE DIALING ACTIVE - the claim lock"
        text claimedByMemberId
        text claimedByEmail
        datetime claimedAt
        datetime lastHeartbeatAt
        text currentCallId
        text lastSyncedAt
    }

    agencyCalls {
        text name "generated"
        select direction "INBOUND OUTBOUND MISSED"
        select status "IN_PROGRESS COMPLETED FAILED NO_ANSWER BUSY, the system result"
        select disposition "the operator outcome, from lib/call-outcome"
        text notes "dialer dock notes, autosaved"
        text fromNumber
        text toNumber
        datetime startedAt
        datetime endedAt
        number durationSeconds
        text telnyxCallId "X-Telnyx-Call-Control-ID, captured from the 200 OK"
        text telnyxRecordingId
        text recordingUrl "expires, play via /api/calls/:id/audio"
        text transcript
        select transcriptionStatus "NONE PENDING READY FAILED"
        text summary "mirrors aiSummary once analyzed"
        text aiSummary "1-2 sentence AI summary, on the row itself"
        text aiSentiment "POSITIVE NEUTRAL NEGATIVE MIXED, the prospect"
        number aiScore "0-100, how the call went"
        text aiKeyPoints "JSON string array, max 5"
        text aiScores "JSON 1-5: conversion, politeness, questioning, engagement, sentiment"
        number aiConfidence "0-1 model confidence"
        text aiModel "OPENAI_ANALYSIS_MODEL id"
        datetime aiAnalyzedAt
        text debugLog "SIP event trail, 8KB cap"
        text meetingUrl
        text meetingProvider
        datetime meetingAt
        select meetingStatus
        text meetingBookingId
        text agencyPhoneId "relation to agencyPhones"
        text agencyProspectId "relation to agencyProspects"
        text agencyLeadId "relation to agencyLeads"
    }

    agencyPeople {
        text name "the person at the business"
        text jobTitle
        text personRole
        text city
        text phones "PHONES composite"
        text emails "EMAILS composite"
        text linkedinLink "LINKS composite"
        text prospectId "relation to agencyProspects"
    }

    agencyOffers {
        text name "INDUSTRY:urlKey"
        select status
        select videoMode "PROSPECT"
    }

    agencyCallLogs {
        text name "direction: outcome"
        text leadId
        text userId
        text campaignId
        text recordingUrl
        number duration_seconds
    }
```

> Source: [`docs/diagrams/data-model.mmd`](docs/diagrams/data-model.mmd).

| | |
|---|---|
| ![Admin: the Twenty objects](docs/screenshots/admin-objects.png) | ![Record history on a contact](docs/screenshots/contact-history.png) |
| Admin: the Twenty objects | Record history on a contact |

`bun run twenty:schema` (or `POST /api/setup/twenty`) creates all of these,
plus `agencyPerson`, `callCampaign` (dial lists) and `dialerAudioSession`, from
one manifest: [backend/src/lib/twenty/schema/manifest.ts](backend/src/lib/twenty/schema/manifest.ts).
That is 10 objects, 134 fields and 9 relations, with select options exactly as
the live workspace has them. It only adds what is missing and never edits or
deletes, so it is safe to run against a workspace in use; `twenty:schema:check`
reports what it would create. `GET /api/setup/twenty/status` checks the same
manifest from the running app.

One API rule worth memorising: Twenty writes relation fields as
`{fieldName}Id`, so a relation declared as `campaignId` is sent as
`campaignIdId`.

### New-lead phone notifications

<!-- mermaid:bark-new-lead-notify.mmd -->
```mermaid
sequenceDiagram
    autonumber
    participant SRC as Lead source<br/>dialer UI, Twenty UI,<br/>CSV import, API
    participant API as API (Express)
    participant TW as Twenty CRM
    participant BARK as Bark server<br/>api.day.app or self-hosted
    participant APNS as Apple APNs
    participant IPH as Member iPhone<br/>Bark app installed

    SRC->>API: POST /api/leads {contact, company, phone}
    API->>TW: POST /rest/agencyLeads
    TW-->>API: lead row id
    API->>API: markLeadNotified(id)<br/>10-minute cross-path dedupe
    API->>API: broadcastNewLead (fire-and-forget)<br/>a push failure never fails the lead

    SRC->>TW: lead created outside the dialer<br/>Twenty UI, CSV, API, workflow
    TW-->>API: POST /api/twenty/webhooks<br/>{event: agencyLead.created, data}
    Note over TW,API: token or HMAC gate, non-lead events<br/>ack 2xx and ignore, known ids dedupe-skip
    API->>TW: GET /rest/agencyLeads/:id<br/>full lead metadata (webhook payload can be partial)

    API->>TW: GET /rest/workspaceMembers
    TW-->>API: members with barkKey<br/>BARK_KEY metadata field, RICH_TEXT markdown
    Note over API,TW: members without a BARK_KEY are skipped<br/>their key was never stored on the object

    loop every member that has a BARK_KEY
        API->>BARK: POST /push {device_key, title, body, url}<br/>url is {FRONTEND_URL}/leads/:leadId
        BARK->>APNS: push payload
        APNS-->>IPH: notification appears
    end

    IPH->>IPH: member taps the notification
    IPH->>API: open /leads/:leadId<br/>LeadDetailPage, the lead itself, not a list
```

> Source: [`docs/diagrams/bark-new-lead-notify.mmd`](docs/diagrams/bark-new-lead-notify.mmd).

| | |
|---|---|
| ![A lead](docs/screenshots/lead.png) | ![Notes on a contact](docs/screenshots/contact-notes.png) |
| A lead | Notes on a contact |

### Member identity and record attribution

Records the dialer writes are attributed to the member who is signed in, not to
the API key. Two channels are written side by side, and both depend on schema
that `POST /api/setup/twenty` creates.

<!-- mermaid:member-attribution.mmd -->
```mermaid
flowchart TB
    subgraph twenty ["Twenty (identity provider + system of record)"]
        wm["workspaceMember<br/>the signed-in human<br/>id, userId, userEmail, name"]
        actor["createdBy Actor<br/>system actor, source API<br/>SETTABLE via REST"]
        own["createdByMemberId<br/>own TEXT field on the object<br/>queryable UUID, SETTABLE"]
        beat["agencyPhone.lastHeartbeatAt<br/>DATE_TIME, SETTABLE"]
    end

    subgraph auth ["Identity (backend)"]
        sess["POST /api/oauth/session<br/>introspect token -> resolve member"]
        jwt["dialer JWT<br/>workspaceMemberId, memberName"]
        mw["authMiddleware<br/>req.workspaceMemberId, req.memberName"]
        guard["requireMember()<br/>401 when the session has no member"]
    end

    subgraph writes ["Attribution on write"]
        calls["POST /api/calls<br/>createdBy Actor + createdByMemberId"]
        leads["POST /api/leads<br/>createdById, assigned_to"]
        pro["POST /api/prospects<br/>createdBy Actor + createdByMemberId"]
    end

    subgraph claim ["Number claim lifecycle (same member)"]
        hb["POST /phones/:id/heartbeat<br/>every 3s, holder only"]
        rel["POST /phones/:id/release<br/>holder only, or force"]
    end

    twenty -->|"introspect sub / username"| sess
    sess --> wm
    wm -->|"resolved row"| sess
    sess --> jwt --> mw --> guard
    guard -->|"member id is server-derived,<br/>never taken from the request body"| calls
    guard --> leads
    guard --> pro
    guard --> hb
    guard --> rel

    calls --> actor
    calls --> own
    pro --> own
    pro --> actor
    hb --> beat
    rel --> beat

    note1["updatedBy is NOT settable.<br/>Twenty recomputes it from the<br/>authenticated caller, so it stays<br/>the API actor. Read createdBy."]
    actor -.- note1
```

> Source: [`docs/diagrams/member-attribution.mmd`](docs/diagrams/member-attribution.mmd).

| | |
|---|---|
| ![Admin: activity by member](docs/screenshots/admin-activity.png) | ![Admin: team activity](docs/screenshots/admin-team.png) |
| Admin: activity by member | Admin: team activity |

The member id is derived server-side from the JWT, never read from a request
body, so a caller cannot claim to be someone else. Two consequences worth
knowing:

- `createdBy` is settable and reads back the real member.
- `updatedBy` is **not** settable. Twenty recomputes it from the authenticated
  caller, so it keeps reporting the API actor. Attribution reads `createdBy`.

Because both channels write plain fields, the object must actually have them.
`GET /api/setup/twenty/status` lists every field the routes read or write and
reports `exists: false` for anything the workspace is still missing.

### Key status values

`agencyProspects.coldCallStatus`

| Value | Meaning |
|---|---|
| `NEW` | no contact made |
| `CONTACTED` | initial contact made |
| `INTERESTED` | showed interest |
| `NOT_INTERESTED` | declined |
| `CALLBACK` | needs a callback |
| `CONVERTED` | became a lead |
| `DO_NOT_CONTACT` | do not call again |

`agencyCalls.status`

| Value | Meaning |
|---|---|
| `IN_PROGRESS` | dialled, not yet wrapped up |
| `COMPLETED` | answered, or a wrap-up status the UI does not distinguish |
| `NO_ANSWER` | rang out |
| `BUSY` | busy |
| `FAILED` | transport or setup failure |

`agencyPhones.callState`

| Value | Meaning |
|---|---|
| `IDLE` | free |
| `DIALING` | claimed, call not yet up |
| `ACTIVE` | answered |

Full field tables are in [docs/okf/datamodel/dialer.md](docs/okf/datamodel/dialer.md).

## Running it

The short version is [Run your own in five commands](#run-your-own-in-five-commands).
In more detail:

```bash
git clone https://github.com/matthewdonsemail-lab/dialer.git
cd dialer
bun run install:all             # root, shared package, backend, frontend

cp .env.example .env.local      # Twenty, JWT, Telnyx, OpenAI-compatible key
cp frontend/.env.example frontend/.env.local   # VITE_API_URL and VITE_SIP_*

bun run twenty:schema:check     # what your workspace is missing
bun run twenty:schema           # create it
bun run twenty:seed             # optional demo data (fresh workspaces only)

bun run dev                     # backend on :4000, frontend on :5173
```

Open http://localhost:5173 and sign in with your Twenty account. Twenty is the
identity provider (OAuth with PKCE, see [docs/identity.md](docs/identity.md));
the dialer keeps no users of its own. Port 5173 is pinned because it is the
OAuth client's registered redirect.

The screenshots in this README come from the same demo data, captured by a
script that never touches a real workspace:

```bash
bunx playwright install chromium   # once
bun run screenshots                # every page and tab into docs/screenshots/
```

The native app is a separate build with its own toolchain:

```bash
cd twenty-native-app
yarn install
yarn twenty app:publish --private
yarn twenty app:install
```

`twenty-native-app/AGENTS.md` is the Twenty team's own guide for this project
structure, and it is worth reading before changing anything under
`twenty-native-app/src/`.

More in [docs/quick-start.md](docs/quick-start.md) and [SETUP.md](SETUP.md).

## Configuration

Full reference in [SETUP.md](SETUP.md). The shape of it:

```env
# Twenty CRM. Required by every server.
TWENTY_BASE_URL=https://twenty.example.com
TWENTY_API_KEY=

# backend/ only. Signs its own JWTs.
JWT_SECRET=
PORT=4000

# Telnyx. Server-side only, never VITE_.
TELNYX_API_KEY=
TELNYX_WEBHOOK_TOKEN=        # shared gate for the webhook receiver (?token=)
```

```env
# frontend/. Baked into the bundle at build time.
VITE_API_URL=http://localhost:4000
VITE_SIP_URI=sip:username@sip.telnyx.com
VITE_SIP_PASSWORD=
VITE_SIP_WS_URL=wss://sip.telnyx.com:7443
VITE_SIP_CALLER_ID=+15551234567
VITE_SIP_PROVIDER=telnyx
```

`VITE_SIP_*` values are compiled in, so changing one needs a rebuild. That is
also why a redeploy can serve a bundle with stale SIP config if the CDN is
cached; the app detects a stale chunk and reloads with a cache buster.

SIP is not Telnyx-specific. See [docs/sip-providers.md](docs/sip-providers.md).

## Production authentication

Production sign-in is a Twenty OAuth PKCE flow: the browser receives a code,
the backend redeems it, introspects the Twenty token, resolves a real workspace
member, and mints a 24-hour dialer JWT. The October 2026 Vercel incident came
from a failed backend entrypoint, missing SPA deep-link routing, and incomplete
Production environment variables. That produced distinct errors in sequence:
missing OAuth config, a CORS 403, and a session-mint 502. The commit history,
fixes, required settings, and status-code guide are in the
[production OAuth incident and runbook](docs/production-oauth-runbook.md).

## Repository layout

Every folder and file is camelCase, and everything lives in a domain, then a
primitive named after what it is about. [docs/naming-conventions.md](docs/naming-conventions.md)
has the rule; `scripts/check-code.mjs` enforces it on every commit.

```
dialer/
├── backend/                     Express API, port 4000
│   └── src/
│       ├── lib/<domain>/        twenty (client, schema, pipelines...), telnyx, ai, website, demo
│       ├── middleware/          auth (JWT)
│       └── routes/<domain>/     one module per resource: prospects, calls, people, callCampaigns...
├── frontend/                    Vite SPA, the browser softphone
│   ├── api/telnyx-webhook.ts    Telnyx webhook receiver (Vercel function)
│   └── src/domains/<domain>/<primitive>/
│                                app, auth, api, ui, dialer, calls, contact, campaigns,
│                                scripts, reports, admin, feedback, website, settings...
├── packages/shared/             @dialer/shared: the state machines, SMS route rule,
│                                and the generated Twenty client, used by both sides
├── railcode/                    same UI, Hono worker, Railcode deployment
├── twenty-native-app/           the dialer as a Twenty app
├── docker/                      Dockerfiles, compose, nginx configs
├── docs/                        everything below, plus screenshots/ and diagrams/
└── scripts/                     the commit and push checks, codemods, screenshot capture
```

Deliberately **not** tracked: host-specific infrastructure, unrelated apps,
vendored third-party skills, deploy staging output, and credentials. See
[.gitignore](.gitignore) and
[scripts/twenty-schema/README.md](scripts/twenty-schema/README.md).
`scripts/check-scope.mjs` fails the push if any of them comes back.

## API reference

Mounted by `backend/src/index.ts`, mirrored in `railcode/server/index.ts`, and
served inside Twenty at `/dialer/*`.

| Method | Path | Notes |
|---|---|---|
| GET | `/api/oauth/config` | Public OAuth client and callback configuration for the SPA. |
| POST | `/api/oauth/token` | Redeems a Twenty authorization code using the PKCE verifier. |
| POST | `/api/oauth/session` | Introspects the Twenty token, resolves a workspace member, and mints the dialer JWT. |
| GET | `/api/auth/me` | Current workspace member from the dialer JWT. |
| POST | `/api/auth/signup` | Disabled; create the member in Twenty, then use Twenty SSO. |
| GET POST PATCH DELETE | `/api/leads` | CRUD. |
| GET POST PATCH DELETE | `/api/prospects` | CRUD. |
| GET | `/api/prospects/:id/website-status` | Resolves the industry funnel and offer URLs. |
| POST | `/api/prospects/:id/website-sent` | Advances `outboundLabel` to `SMS_IN_PROGRESS`. |
| POST | `/api/prospects/:id/ensure-offer` | Idempotently creates the `INDUSTRY:<key>` offer. |
| GET POST PATCH DELETE | `/api/campaigns` | CRUD. |
| GET POST PATCH DELETE | `/api/people` | The people at a business (`agencyPerson`), by `prospectId` or `leadId`. |
| GET POST PATCH DELETE | `/api/call-campaigns` | Dial lists for power dialing. Status follows the shared `callCampaign` machine. |
| GET | `/api/prospects/page` | Contacts a window at a time, searched, filtered and sorted in Twenty. |
| GET | `/api/prospects/facets` | Counts per status, country, industry and campaign for the filter menus. |
| GET | `/api/admin/activity` | Create, update and delete events on dialer records, or one record's history. |
| POST | `/api/calls/:id/analyze` | AI review of the transcript, written onto the call row. |
| GET POST | `/api/audio-sessions` | Phone audio: the call bridged to the agent's own phone. |
| GET POST PATCH DELETE | `/api/scripts` | CRUD. `scriptData` is a JSON string. |
| GET | `/api/twenty/phones` | Inventory with live claim state. |
| POST | `/api/twenty/phones/:id/claim` | `IDLE` to `DIALING`. 409 with `heldBy` when taken. |
| POST | `/api/twenty/phones/:id/state` | `DIALING` or `ACTIVE`. Holder only. |
| POST | `/api/twenty/phones/:id/release` | Back to `IDLE`. Holder only unless `force`. |
| GET | `/api/twenty/meta/:object` | SELECT options, from the Twenty metadata API. |
| POST | `/api/setup/twenty` | Creates whatever the schema manifest has that the workspace lacks. |
| GET | `/api/setup/twenty/status` | Every manifest object and field, with `exists`. |
| GET | `/api/calls` | Newest first. |
| GET | `/api/calls/:id/audio` | 302 to a freshly resolved Telnyx mp3. |
| POST | `/api/calls/:id/record` | `record_start` with transcription. Needs `telnyxCallId`. |
| POST | `/api/calls/:id/reconcile` | Repair path: match a recording by from and to. |
| POST | `/api/calls` | Creates the row. Best effort, also stamps `currentCallId`. |
| PATCH | `/api/calls/:id` | Disposition, recording, transcript, meeting, `debugLog`. |
| GET | `/api/health` | Config flags. |
| GET | `/api/netcheck` | Allowlisted TCP probe. Best effort. |

`/api/call-logs` and `/api/profiles` are legacy, read the old call log object,
and are **not** behind `authMiddleware`. Everything else is.

## Documentation map

Full index with descriptions: [docs/README.md](docs/README.md).

**Understand it**

- [Architecture](docs/architecture.md) - the three surfaces, the servers, the auth model
- [Data flow](docs/data-flow.md) - reads, writes, keyset pagination, the schema
- [Diagrams](docs/diagrams/README.md) - all six, with the source that implements each

**Run it**

- [Quick start](docs/quick-start.md)
- [Setup reference](SETUP.md) - `setup.sh`, the schema command, the demo seed
- [Screenshots](docs/screenshots/README.md) - every page and tab
- [Design system](docs/design-system.md) - the scale, primitives and shared pipelines every screen uses
- [SIP providers](docs/sip-providers.md)

**Ship it**

- [Deployment](docs/deployment.md)
- [Contributing](CONTRIBUTING.md) - hooks, checks, commit convention
- [Changelog](CHANGELOG.md)

**When it breaks**

- [Production OAuth incident and runbook](docs/production-oauth-runbook.md) - Vercel deployment history, production config, and status-code triage
- [Twenty troubleshooting](docs/twenty-troubleshooting.md)
- [Telnyx reference](docs/telnyx/README.md)

**Reference, not documentation**

- [Plans](docs/plans/) - scoped but unbuilt design work
- [Marketing](docs/marketing/) - launch copy
- [Data model snapshot](docs/okf/datamodel/dialer.md)
- [Twenty schema helpers](scripts/twenty-schema/README.md) - local only, gitignored
- `docs/telnyx/upstream/`, `docs/twenty/upstream/` - mirrored vendor docs, gitignored.
  Fetch with `bun run docs:telnyx` and `bun run docs:twenty`.

## Checks

```bash
bunx lefthook install     # once, after cloning
```

Three gates, cheapest first. All of them are plain `node scripts/*.mjs` or the
repo's own build and test commands; [CONTRIBUTING.md](CONTRIBUTING.md) has the
full table and the bypass variable for each.

| Gate | Runs |
|---|---|
| pre-commit | the branch name, the staged code on the TypeScript AST (naming, layout, dead buttons, hidden toggle state, hard-coded pipeline values), the design system, no emojis, no monospace, no fully rounded corners, no credentials, and `bun.lock` with any dependency change |
| commit-msg | Conventional Commits, header at most 72 characters |
| pre-push | every file against the code rules, types in all three packages, every unit test, the production build, the CRUD failure map, the docs and diagrams, and the scope check |

Run any of them by hand:

```bash
node scripts/check-code.mjs
node scripts/run-tests.mjs
bun run check:docs
bunx lefthook run pre-push
```

## License

MIT. See [LICENSE](LICENSE).

---

<!-- footer:offer-set:start -->
## Support

If this is useful, a star helps someone else find it.

[![Stars](https://img.shields.io/github/stars/matthewdonsemail-lab/dialer?style=flat-square)](https://github.com/matthewdonsemail-lab/dialer/stargazers)
[![Forks](https://img.shields.io/github/forks/matthewdonsemail-lab/dialer?style=flat-square)](https://github.com/matthewdonsemail-lab/dialer/network/members)
[![Watchers](https://img.shields.io/github/watchers/matthewdonsemail-lab/dialer?style=flat-square)](https://github.com/matthewdonsemail-lab/dialer/watchers)
[![Last commit](https://img.shields.io/github/last-commit/matthewdonsemail-lab/dialer?style=flat-square)](https://github.com/matthewdonsemail-lab/dialer/commits)
[![License](https://img.shields.io/github/license/matthewdonsemail-lab/dialer?style=flat-square)](https://github.com/matthewdonsemail-lab/dialer/blob/main/LICENSE)

[![GitHub](https://img.shields.io/badge/GitHub-matthewdonsemail-lab/dialer-181717?style=flat-square&logo=github&link=https://github.com/matthewdonsemail-lab/dialer)](https://github.com/matthewdonsemail-lab/dialer)
[![X](https://img.shields.io/badge/X-matthewsoldit-000000?style=flat-square&logo=x&link=https://x.com/matthewsoldit)](https://x.com/matthewsoldit)
[![Issues](https://img.shields.io/github/issues/matthewdonsemail-lab/dialer?style=flat-square)](https://github.com/matthewdonsemail-lab/dialer/issues)
[![Pull requests](https://img.shields.io/github/issues-pr/matthewdonsemail-lab/dialer?style=flat-square)](https://github.com/matthewdonsemail-lab/dialer/pulls)

## Star history

[![Star History Chart](https://api.star-history.com/image?repos=matthewdonsemail-lab/dialer&type=Date)](https://star-history.com/#matthewdonsemail-lab/dialer&Date)
<!-- footer:offer-set:end -->
