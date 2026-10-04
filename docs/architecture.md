# Architecture

The dialer has no database of its own. Every record lives in Twenty CRM as an
`agency*` custom object, and every server the dialer runs is a thin translator
between an HTTP client and the Twenty REST API.

That single fact explains most of the design decisions below.

## The three surfaces

The dialer ships as three independently deployable things. They are separate
code paths against the same six objects. None of them calls another.

| Path | Directory | Server | Auth | Ships |
|---|---|---|---|---|
| A1 | `frontend/` + `backend/` | Express on `:4000` | own JWT, bcrypt against Twenty's `core.user` | Vercel, or self-hosted |
| A2 | `railcode/` | Hono worker on Railcode | the Railcode platform session | Railcode, private to the org |
| B | `twenty-native-app/` | none, it runs inside Twenty | the Twenty workspace session | the Twenty app registry |

Path A also has a fourth piece with no UI of its own:
`frontend/api/telnyx-webhook.ts`, a Vercel serverless function that receives
Telnyx events and writes recordings and transcripts onto `agencyCalls` rows.

See [diagrams/integration-paths.mmd](./diagrams/integration-paths.mmd) for what
only each path can do, and [diagrams/system-context.mmd](./diagrams/system-context.mmd)
for the external systems.

### Which is current

Path B is the newest and is the direction of travel: it is the only thing
touched by the two most recent commits, and it is the only path that gives an
agent dialing inside Twenty with no second login and no extra host.

Path A is the only path with a real softphone. The native app deliberately does
not implement SIP/WebRTC, Telnyx recording, or audio playback. If you need to
place or record a call, you are on Path A.

`railcode/` is a hand-maintained port of `frontend/`. The softphone and
almost every component are byte-identical between the two; the differences are
platform adaptations (Railcode has no passwords, so the login routes are gone
and the session is the platform cookie) plus a handful of places where
`frontend/` has moved ahead. When you fix a bug in the softphone, expect to
apply it in both.

## The servers

### `backend/` - Express

Routers are mounted in `src/index.ts`. Each one applies `authMiddleware` for
the whole router except `callLogs` and `profiles`, which are unauthenticated.

```
/api/auth              login (Twenty core.user + bcrypt), signup (disabled), me
/api/leads             CRUD
/api/prospects         CRUD, plus website-status, website-sent, ensure-offer
/api/campaigns         CRUD
/api/scripts           CRUD
/api/twenty/phones     list, claim, state, release
/api/twenty/meta       SELECT options for one object
/api/setup/twenty      idempotent schema bootstrap
/api/calls             list, get, create, patch, record, reconcile, audio
/api/call-logs         legacy, unauthenticated
/api/profiles          read only, unauthenticated
/api/health            config flags
/api/netcheck          allowlisted TCP reachability probe
/api/calls/recording   multipart upload of browser-recorded audio
```

Twenty access is in `src/lib/twenty-client.ts`: `fetch` against
`${TWENTY_BASE_URL}/rest/<object>`, `Authorization: Bearer <TWENTY_API_KEY>`.
Response envelopes vary between Twenty versions, so every call goes through an
unwrapper that tries the shapes in turn. GraphQL is used only for metadata, in
`src/lib/twenty-object-service.ts`.

The only direct database access in the whole repo is
`src/db/twenty-pg.ts`, which runs exactly one query: read `core."user"` to
verify a password. `src/db/schema.ts` is dead Drizzle/SQLite code and is never
imported.

### `railcode/` - Hono on Railcode

A faithful port of the Express routes onto Hono, with two differences that
matter:

- **Auth is the platform session.** There are no `app.use()` calls at all; each
  route reads `ctx.user` and returns 401 if it is null.
- **Twenty is reached through an org connector.** `server/lib/twenty.ts` calls
  `connector("twenty").fetch(path)`. The worker holds no API key. The
  connector's base URL already ends in `/rest`, so worker paths must not add
  the prefix: `/metadata/objects`, never `/rest/metadata/objects`. The doubled
  path 400s.

One Tailwind gotcha is worth keeping in mind, because it fails silently:
`tailwind.config.js` lives at `railcode/tailwind.config.js`, one level above
the Vite root, with `./frontend/...` content globs. Tailwind resolves its config
relative to the process cwd. With the config inside `frontend/`, Tailwind emits
preflight only and no utilities, with no error.

### `twenty-native-app/` - logic functions in Twenty

33 logic functions under `src/logic-functions/`, each a thin wrapper over
`src/lib/dialer-client.ts`. All are `isAuthRequired: true` with a 15 second
timeout. `dialer-client.ts` constructs `RestApiClient` and `MetadataApiClient`
lazily, because the manifest builder imports these modules at build time outside
the platform runtime where the constructors do not exist.

The front component calls its own logic functions over HTTP. `api.ts` builds
paths beginning `/s/dialer/...`; the SDK treats the `/s/` prefix as a routing
signal and sends the request to `TWENTY_FUNCTIONS_URL` instead of
`TWENTY_API_URL`. So one user action in the native app is two client hops and
two base-URL resolutions.

Record access uses `RestApiClient` rather than `CoreApiClient` on purpose. The
runtime `CoreApiClient` schema only knows the standard objects, so the custom
`agency*` objects fail validation there. The REST endpoints are generated from
the live workspace schema and serve every object.

The front component runs in a Remote-DOM sandbox, which is why `DialerApp` uses
a hand-rolled tab strip instead of `twenty-ui`'s `Tabs` (it calls
`compareDocumentPosition`, which the sandbox cannot answer) and why `FieldCell`
imports only from `twenty-ui/primitives/data-display`.

## Data

See [data-flow.md](./data-flow.md) for the request paths and
[diagrams/data-model.mmd](./diagrams/data-model.mmd) for the objects.

## Recording

Recording is Telnyx server-side only. The browser never records a call; the
`<audio>` elements in the app are playback only. `POST /api/calls/:id/record`
asks Telnyx for `mp3`, `dual` channels, `transcription: true`.

Two details break the recording path if you change them:

- The call-control id must be read in the `requestDelegate` passed to
  `inviter.invite()`. The `Inviter` constructor delegate does not fire
  `onAccept` in sip.js 0.21, which is how the id was being lost.
- The id must be stamped onto the row with a `PATCH` *before* `POST
  /api/calls/:id/record` is called, because `/record` re-reads the row and
  returns 400 when `telnyxCallId` is empty.

`POST /api/calls/:id/reconcile` is the repair path. When no call-control id was
ever captured it lists Telnyx recordings filtered by from and to, takes the
first completed one created within 15 minutes of the call, and attaches it.

Telnyx download URLs expire in about 10 minutes, so `GET /api/calls/:id/audio`
re-resolves a fresh URL server-side and 302s to it. The API key never leaves the
server.

## Auth, and where it is thin

The number lock is the only write in the dialer that anybody contests, and it is
the one with the thinnest checks. `callState` on the `agencyPhones` row is the
whole mechanism: `IDLE`, `DIALING`, `ACTIVE`, plus `claimedByMemberId`,
`claimedByEmail` and `claimedAt`. It lives in Twenty rather than in server
memory so it survives a restart and every surface reads the same value.

- `backend/` signs its own JWT with `JWT_SECRET` and verifies passwords against
  Twenty's `core.user`. There is no role or permission check anywhere; the
  login response hardcodes `role: "agent"`.
- The claim protocol authorises by a **body-supplied `memberId`**, which is
  never compared against the authenticated user. Any authenticated caller can
  claim, advance, or release a number as another member, and `force: true` on
  release skips the holder check entirely. Abandoned claims do expire: a
  non-`IDLE` claim older than `CLAIM_STALE_AFTER_MINUTES` (default 60) may be
  taken by a new claim and released by anyone, and the softphone also sends a
  keepalive release/row-close on tab `pagehide` — but the check-then-write is
  still not atomic, so two simultaneous claims can both succeed.
- In the native app, `phone-state` and `phone-release` treat `memberId` as
  optional, so omitting it bypasses the holder check there too. `phone-claim`
  requires it and answers 409; the other two answer 403.

This is a known gap, not an oversight to be documented as fixed. Read
[diagrams/phone-claim.mmd](./diagrams/phone-claim.mmd) before changing any of
it.
