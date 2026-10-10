# HANDOFF: rebuild `/contacts/:id` as a GoHighLevel-style dialer, conversation and contact page

> **For Claude Code.** Read this whole file first, then the screenshots in `docs/references/dialer-ui/` (index: `docs/references/dialer-ui/README.md`).
> Work on a new branch off the current one (`feat/ui-overhaul-paged-contacts`), for example `feat/contact-dialer-page`.
> Track the work with `tbd` (see AGENTS.md): one bead per phase below.
> Commit at the end of each phase.

---

## 0. Goal, in one paragraph

The current `/contacts/:prospectId` page (`frontend/src/pages/ProspectDetailPage.tsx`) is three fixed 460px cards followed by rows of widgets. Rebuild it to match three things:
- the **interaction model** of GoHighLevel's Contact Detail page, Web Dialer and Conversations, with Close's call bar and timeline;
- the **visual language** of our own Reports, Admin and Scripts pages;
- a contact page in **3 panes**: contact fields on the left, one unified conversation and activity feed with a composer in the centre, and a tabbed tool rail on the right (Script, Website, Calls, Tasks).

The **softphone becomes a global dock** opened from a phone button in the top bar, so a call survives navigation. Real **SMS** goes through Telnyx and is stored in two new Twenty objects, `agencyConversations` and `agencyMessages`, which also power a new `/conversations` inbox.

---

## 1. Reference screenshots (already in the repo)

`docs/references/dialer-ui/screenshots/`. The ones you must look at:

| Build this | Copy this pattern from |
|---|---|
| Contact page, 3 panes | `ghl-01-contact-detail-3panel.png`, `ghl-02-contact-activity-panel.png`, `ghl-12-contact-card-2026-redesign.png`, `attio-01-record-page-overview.png` |
| Header action pills (Note, SMS, Call) and timeline filters | `close-01-lead-page-header-composer-tabs.png` |
| Left sidebar sections | `close-08-lead-sidebar-panels.png`, `ghl-12-…` |
| Global dialer, idle (keypad, recents, bottom tabs) | `ghl-04-dialer-keypad-topbar.png`, `ghl-05-dialer-2026-recents-tabs.png` |
| Dialer settings (caller ID, recording, audio devices) | `close-02-phone-settings-popover.png` |
| In-call screen with a script docked beside it | `ghl-08-dialer-in-call-with-script.png` |
| Post-call summary and disposition chips | `ghl-06-dialer-call-summary-disposition.png` |
| Call items in the feed (status pill, player, transcript) | `ghl-10-conversations-call-bubbles-transcript.png`, `close-03-…`, `close-05-…` |
| Inline call note | `close-04-call-note-composer.png` |
| `/conversations` inbox | `ghl-09-conversations-redesign-2025.png`, `close-07-inbox-channel-tabs-localtime.png` |
| Queue and power dialer controls | `ghl-11-manual-actions-call-queue.png`, `close-06-power-dialer-pause-next.png` |

**Copy layout and behaviour only.** Every colour, radius and font comes from our tokens (§3).

---

## 2. Current state: what exists and what is broken

### Files involved

| Area | File |
|---|---|
| Route | `frontend/src/App.tsx:74` (`contacts/:prospectId` → `ProspectDetailPage`), `leads/:leadId` → `LeadDetailPage` |
| Page | `frontend/src/pages/ProspectDetailPage.tsx` (554 lines), `frontend/src/pages/LeadDetailPage.tsx` (372) |
| Softphone | `frontend/src/components/softphone/Softphone.tsx` (1520 lines, sip.js 0.21, `full` and `compact` variants) |
| Power dialer | `frontend/src/components/campaigns/PowerDialer.tsx` (provider in `Layout.tsx:168-169`; it mounts `<Softphone variant="compact">` at `fixed top-12 left-1/2 z-[55]`) |
| Script | `frontend/src/components/scripts/CallScriptWidget.tsx` (hard-coded 460px height) |
| SMS today | `frontend/src/components/website/SendWebsiteWidget.tsx`. It only opens an `sms:` link, then calls `POST /api/prospects/:id/website-sent`, which just sets `outboundLabel=SMS_IN_PROGRESS` |
| Calls API | `backend/src/routes/calls/index.ts`, `frontend/src/hooks/use-call-logs.ts` (`useCallsForRecord` fetches **every** call and filters in the browser) |
| Telnyx webhook | `backend/src/routes/telnyx/webhook/index.ts` (recording and transcription only; **no `message.*` handling**) |
| Twenty access | REST: `backend/src/lib/twenty/client/index.ts`. Typed GraphQL (genql): `backend/src/lib/twenty/graphql/index.ts` plus `packages/shared/src/generated/client` (generated Sep 29 and **stale**). Metadata: `backend/src/lib/twenty/objectService/index.ts` (`setupTwentyCRM`, `createRelationField`), `backend/src/lib/twenty/agencyCall/index.ts` (how agencyCall fields and relations get created) |
| Prospect mapping | `backend/src/routes/prospects/helpers/map-prospect.ts`, `routes/prospects/index.ts` |
| Layout | `frontend/src/components/common/Layout.tsx`. Top bar at `:241-293`, right-side actions group at `:288`, main column ends at `:299` |

### Bugs to fix first (Phase 0)

1. **Call ends when you leave the page.** `<Softphone>` is mounted inside the page. On unmount it releases the number claim and stops the mic, but the outbound session and the sip.js `UserAgent` (created per call inside `startCall`, ~`:741`) are never stopped.
2. **No inbound calls while idle.** The UA only exists during an outbound dial, so `onInvite` (`:758-771`) cannot fire when the phone is idle.
3. **Notes field writes the wrong thing.** `mapProspectDetail` sets `notes: prospect.outboundLabel` (`map-prospect.ts:160`) and PATCH writes `notes` into `outboundLabel` (`routes/prospects/index.ts:382`). `outboundLabel` is a SELECT, so free-text notes corrupt the SMS pipeline label.
4. **Call notes are dropped.** The softphone passes `notes` to `onCallEnd`, the page ignores it, and `agencyCall` has no notes field.
5. **Wrong cache key.** Pages invalidate `["twenty-phones"]`; the real key is `["twentyPhones"]` (ProspectDetailPage `:147`, LeadDetailPage `:80`).
6. **Caller ID comes from the wrong place.** The softphone's `callerId` comes from the "Send from" select inside `SendWebsiteWidget`. The dialer has no number picker of its own.
7. **Schema drift.** The generated schema has `agencyCall.status` as a 5-value enum (`IN_PROGRESS|COMPLETED|FAILED|NO_ANSWER|BUSY`) and no `ai*` / `createdByMemberId` fields. Meanwhile `frontend/src/lib/call-outcome.ts:41-58` writes `INTERESTED`, `VOICEMAIL`, `DNC`, … **Check the live schema** (run `bun run api:client` or §6 step 1) and fix whichever side is wrong. The recommended fix is in §5.3.
8. **Debug logging.** `console.log`s in ProspectDetailPage `:96-99`, Softphone `:1022,1032`, and the backend `GET /api/prospects/:id` at `routes/prospects/index.ts:246-250`.
9. **`qualificationStatus`** is rendered but never mapped by `mapProspectDetail`.
10. **Webhook full scan.** `findCallByTelnyxId` scans every `agencyCalls` row on each webhook (`webhook/index.ts:34-37`). Filter with `telnyxCallId[eq]` instead.

---

## 3. House style (match the Reports, Admin and Scripts pages exactly)

Source of truth: `frontend/src/index.css` tokens, plus the components below. **`docs/design-system.md` is out of date; ignore it.**

### Shell
Copy `ScriptsWorkspace.tsx`'s multi-pane layout (`:207-372`):
- Root: `flex flex-1 min-h-0`.
- Left pane: `aside w-80 shrink-0 border-r border-[var(--ods-border)] flex flex-col min-h-0`.
- Centre: `section flex flex-1 min-w-0 flex-col bg-[var(--ods-bg-secondary)]`.
- Header strip: `px-5 pt-4 pb-3 flex items-center justify-between gap-3 bg-[var(--ods-bg-primary)] border-b border-[var(--ods-border)]`.
- Scroll body: `flex-1 min-h-0 overflow-y-auto p-5 space-y-4`.
- Sticky footer: `p-4 border-t border-[var(--ods-border)] bg-[var(--ods-bg-primary)] shrink-0`.
- Add a mirrored right pane: `w-80 shrink-0 border-l border-[var(--ods-border)] flex flex-col min-h-0`.
- Use a ResizeObserver to collapse to one pane under 760px, the same way ScriptsWorkspace does.

### Reuse these components (do not invent new primitives)

| Component | File | Notes |
|---|---|---|
| `SectionTitle` | `ui/SectionTitle.tsx` | `as`, `pill`, `info`. Put qualifiers in a pill, never in brackets. Explanations go behind the InfoTip eye |
| `TabBar` | `ui/TabBar.tsx` | `tabs: {key,label,icon,badge?}[]`. Active tab: `bg-[var(--ods-brand-600)] text-white` |
| `Chip` | `ui/Chip.tsx` | The only badge style. Meaning comes from the icon or dot colour, never the fill. Also `statusIcon()` |
| `ReportCard`, `StatTiles`, `EmptyState`, `TH`/`TD`/`TR`, `HeadCell`, `ReportTable`, `TwoLineTrigger` | `reports/ReportParts.tsx` | Key/value field rows follow the pattern in `ScriptsWorkspace.tsx:617-631` |
| `ActivityTable` / `ActionBadge` | `admin/ActivityTable.tsx` | For status-change history |
| `SelectMenu` | `ui/Menu.tsx` | Menus |
| `useToast` | `ui/Toast.tsx` | Feedback |
| `ConfirmDialog variant="danger"` | `common/ConfirmDialog.tsx` | Deletes |
| `usePersistedState` | `hooks/use-persisted-state.ts` | Remembering tabs |

### Tokens and sizes
- Cards: `rounded-[10px] border border-[var(--ods-border)] bg-[var(--ods-bg-primary)] p-4`.
- Radii: buttons and inputs 8px, chips `rounded-md`, modals and dialer 12px.
- Text: titles `text-xl font-semibold`; list titles 15px; labels and inputs 14px; table cells and buttons 13px; chips and meta 12px. Numbers use `tabular-nums`.
- Buttons:
  - primary: `h-9 px-3 rounded-[8px] bg-[var(--ods-brand-600)] text-white text-[13px] font-semibold`;
  - secondary: `h-9 px-4 rounded-[8px] border border-[var(--ods-border-strong)]`;
  - icon: `w-9 h-9 rounded-[8px] border border-[var(--ods-border-strong)]`.
- Input: the `INPUT` constant at `ScriptsWorkspace.tsx:590`. Search box: `:213`.
- Icons: `w-4 h-4` by default, `w-3.5 h-3.5` inside chips.
- Dark mode: always use the `--ods-*` vars. Tints use `bg-X-500/15 text-X-600`; `.dark` already lifts these.
- Skeletons come from `ui/PageSkeletons.tsx`. Add `ContactWorkspaceSkeleton` there and use it in `App.tsx` instead of `DetailPageSkeleton`.

---

## 4. Target UI

### 4.1 Global dialer dock (new): `frontend/src/components/dialer/`
Reference: `ghl-04`, `ghl-05`, `ghl-08`, `ghl-06`, `close-02`.

**`DialerProvider.tsx`**
- Mount it in `Layout.tsx` next to `PowerDialerProvider` (`:168-169`).
- It owns **one** sip.js `UserAgent` plus `Registerer`, registered after login, so inbound calls ring while idle.
- It owns the active session, call state, the selected caller-ID line and the dock's open/pinned state.
- It exposes `useDialer(): { open(), dial({ contactType, contactId, phone, name }), state, session, hangup, mute, hold, sendDtmf, line, setLine }`.
- Move all SIP, claim, `ensureCallRow`, recording and `finalizeCall` logic **out of** `Softphone.tsx` into `dialer/sip-session.ts` and `dialer/call-lifecycle.ts`. Keep the existing behaviour:
  - claim → `POST /api/calls` before the INVITE;
  - `P-Asserted-Identity` header;
  - `X-Telnyx-Call-Control-ID` → `/record`;
  - heartbeat;
  - the unanswered watchdog;
  - the pagehide keepalive;
  - phone-audio (AudioBridge) mode.

**Top-bar button**
- Green phone button inserted at `Layout.tsx:288`, before the Bell. Use the same classes; the green dot means "registered".
- Clicking it toggles the dock.

**`DialerDock.tsx`**
- `fixed top-12 right-4 z-[55] w-[360px] rounded-[12px]`, a card on the `--ods-bg-primary` token, with a header that has pin and gear buttons.
- Unpinned, it closes when you click outside. Minimising **never** ends a call; while a call is live, show a small timer pill.
- Views:
  - **Idle.** Header shows "Calling from" as a `SelectMenu` of `agencyPhones` (ACTIVE, not claimed by someone else, with a country hint). Bottom tabs: **Recents** (from `agencyCalls`, newest first; click to redial or open the contact), **Contacts** (search through `/api/prospects/page?q=`), **Keypad** (round 3×4 grid plus input plus green call button), **Queue** (the power-dialer session).
  - **In call.** Avatar, name, number, timer, state chip. Control grid of 3×N round buttons: Mute, Hold, Keypad, Notes, Script, plus Transfer later. Full-width red **End call**.
    - **Notes** opens a textarea in the dock; it autosaves to the call row (§5.3).
    - **Script** opens the campaign script in a panel docked to the **left** of the dock (`ghl-08`), reusing `CallScriptViewer`.
  - **Call summary** (`ghl-06`). Our number, contact, "Call ended" plus a status chip, a duration pill, then disposition chips in a 2-column grid (from `OutcomeSelect`'s options / `lib/call-outcome.ts`), the notes, and **Done**. In a power-dialer session the button is **Save & next**.
    - Saving keeps today's `handleSaveOutcome` behaviour: PATCH status, reconcile, release the number, update the record status via `recordStatusForOutcome`.
  - **Settings sheet** (gear, `close-02`). Caller ID, the audio devices from `AudioSourceSettings`, and phone-audio mode.
  - **Incoming.** A banner inside the dock with Accept and Decline. Replace the full-screen `IncomingCallBanner`.

**Power dialer.** Point `PowerDialer.tsx` at `useDialer().dial()` instead of rendering its own compact `<Softphone>`. Its menu and footer become the dock's Queue tab plus a "Next call →" button (`close-06`).

**Clean-up.** Remove the per-page `<Softphone>` mounts. Delete `Softphone.tsx` once nothing imports it.

### 4.2 Contact workspace: `frontend/src/pages/ContactPage.tsx`
Handles both `contacts/:prospectId` and `leads/:leadId`, with `type` taken from the route. Components go in `frontend/src/components/contact/`.

**Header strip** (full width, above the 3 panes):
- Back arrow, avatar initials, name, `SectionTitle` pill showing the type (Prospect / Lead), a status `Chip` that is clickable (opens `StatusSelect` options from `twentyMeta`), and a country chip.
- Right side: action pills **Call ▾** (pick the number when there are several), **SMS**, **Note**, then a ⋮ menu (Edit, Open in Twenty, Delete). Per `close-01`.
- Also a "‹ n / N ›" pager when the user arrived from the Contacts table (`ghl-03`). Pass the visible id list through router state.

**Left pane: `ContactSidebar.tsx`** (`ghl-12`, `close-08`, `attio-01`):
- A contact card: name, owner, tags.
- Field search plus a "Hide empty" toggle.
- Collapsible sections:
  - **Contact:** phones (each with call and SMS icons), emails, website, address.
  - **Business:** niche, label, rating and reviews, Google links.
  - **Pipeline:** cold-call status, qualification, campaign, outbound state and label, video status, WhatsApp.
  - **System:** created, updated, Twenty link.
- Rows follow the key/value pattern: icon, label, value; "—" when empty; click to edit inline, which calls `useUpdateContact` (optimistic). Remove every `as any` by typing the API shape in `frontend/src/lib/contacts.ts`.

**Centre pane: `ContactFeed.tsx` plus `Composer.tsx`** (`ghl-01`, `ghl-02`, `ghl-10`, `close-01`):
- Filter chips: All, Calls, SMS, Notes, Activity.
- A newest-at-bottom feed with day separator chips. It merges:
  - `agencyMessages` for this contact's conversation (SMS bubbles: outbound on the right with a `--ods-brand` tint, inbound on the left on `--ods-bg-tertiary`; status shown under each bubble — sending, delivered, failed with a "Retry" action);
  - `agencyCalls` (call card: direction arrow, status chip such as "No answer" or "Completed · 3:12", the disposition, an inline recording player via `api.calls.audioUrl`, a "View transcript" expander, AI summary, the note);
  - status changes (`timelineActivities`, or the admin activity endpoint `api.admin.activity?targets=`);
  - notes.
- **Composer** at the bottom:
  - tabs: **SMS** and **Internal note**;
  - `From:` select (agency phones, same rule as the dialer line) and `To:` (the contact's phones);
  - a textarea with a "Chars n · Segs n" counter (GSM-7 160/153, UCS-2 70/67);
  - template insert (the existing `website-status` URLs: template URL and offer URL);
  - Send.
- The "Send website" widget becomes a template inside this composer. Once a message is actually sent through Telnyx, the "Log sent" button is no longer needed.

**Right pane: `ContactRail.tsx`** (`ghl-01` icon rail):
- A `TabBar` with these tabs:
  - **Script:** `CallScriptViewer` for the contact's campaign; auto-selected while a call is live.
  - **Website:** video status, template/offer links, ensure-offer (the read-only half of `SendWebsiteWidget`).
  - **Calls:** stat tiles (total, connected, talk time, last outcome) plus a compact list.
  - **Tasks/Notes:** Twenty `taskTargets` / `noteTargets` for `targetAgencyProspectId` / `targetAgencyLeadId`; can be phase 2.
- Collapsible. Remember the selection with `usePersistedState("contact-rail-tab")`.

### 4.3 Inbox: `frontend/src/pages/ConversationsPage.tsx`, route `conversations`
Reference: `ghl-09`, `close-07`.
- Same 3-pane shell.
- **Left list:** tabs Unread / All / Starred; search; rows show avatar with a channel icon, name, preview, time, unread count badge and a star.
- **Centre:** `ContactFeed` + `Composer` for the selected conversation.
- **Right:** `ContactSidebar`, read-only and compact.
- Add it to the sidebar nav in `Layout.tsx`, with an unread total badge.

---

## 5. Data model: `agencyConversations` and `agencyMessages`

These **do not exist in the repo or in the committed generated schema**. They may already exist in the live Twenty workspace.

**Step 1 of Phase 2 is to introspect live** (§6). If they exist, map the fields below onto whatever is there and **do not create duplicates**. If they don't exist, create them idempotently, following the `setupCallHistorySchema()` pattern in `backend/src/lib/twenty/agencyCall/index.ts`. Add `backend/src/lib/twenty/messaging/schema.ts` with `setupMessagingSchema()` and call it from `setupTwentyCRM()` in `objectService/index.ts`.

### 5.1 `agencyConversation` (one thread per contact phone number)

| Field | Type | Notes |
|---|---|---|
| `name` | TEXT (label) | Contact name or E.164 number |
| `threadKey` | TEXT, `isUnique: true` | `phone:+15551234567`. This is the upsert key, so an inbound SMS from an unknown number can open a thread before a contact is linked |
| `remoteNumber` | TEXT | E.164 |
| `status` | SELECT | `OPEN`, `ARCHIVED` |
| `unreadCount` | NUMBER (int) | |
| `starred` | BOOLEAN | |
| `lastMessageAt` | DATE_TIME | Inbox sort key |
| `lastMessagePreview` | TEXT | |
| `lastMessageType` | SELECT | `SMS`, `MMS`, `CALL`, `VOICEMAIL`, `NOTE` |
| `lastMessageDirection` | SELECT | `INBOUND`, `OUTBOUND` |
| relation `agencyProspect` | RELATION MANY_TO_ONE → agencyProspect | Join column `agencyProspectId`, inverse label "Conversations" |
| relation `agencyLead` | RELATION MANY_TO_ONE → agencyLead | `agencyLeadId`, inverse "Conversations" |
| relation `agencyPhone` | RELATION MANY_TO_ONE → agencyPhone | `agencyPhoneId` (our line), inverse "Conversations" |

Use two plain relations rather than a MORPH field, so it matches how `agencyCall` already links to prospects and leads. `MORPH_RELATION` (`ownerAgencyProspectId`/`ownerAgencyLeadId`) is supported but would be inconsistent with the rest of the code.

### 5.2 `agencyMessage`

| Field | Type | Notes |
|---|---|---|
| `name` | TEXT | First 80 characters of the body |
| relation `conversation` | RELATION MANY_TO_ONE → agencyConversation | **join column `conversationId`**, inverse field `messages` (targetFieldLabel "Messages") |
| `type` | SELECT | `SMS`, `MMS`, `CALL`, `VOICEMAIL`, `NOTE`, `SYSTEM` |
| `direction` | SELECT | `INBOUND`, `OUTBOUND` |
| `status` | SELECT | `QUEUED`, `SENDING`, `SENT`, `DELIVERED`, `FAILED`, `RECEIVED`, `READ` (Telnyx `queued/sending/sent/delivered/sending_failed/delivery_failed/delivery_unconfirmed` map onto these) |
| `body` | TEXT | |
| `fromNumber`, `toNumber` | TEXT | E.164 |
| `sentAt` | DATE_TIME | Feed sort key (use `createdAt` as a fallback) |
| `deliveredAt` | DATE_TIME | |
| `externalId` | TEXT, `isUnique: true` | Telnyx message id. Makes webhook ingestion idempotent (`upsert: true`) |
| `segments` | NUMBER | Telnyx `parts` |
| `errorCode`, `errorMessage` | TEXT | Shown on hover over the failed chip |
| `media` | RAW_JSON | MMS `[{url, content_type, size}]` |
| relation `agencyCall` | RELATION MANY_TO_ONE → agencyCall | `agencyCallId`. Set only when `type=CALL`: a pointer row, so a thread is **one** ordered, paginated query and the inbox `lastMessage*` covers calls too |

The author comes from Twenty's built-in `createdBy` (ACTOR, which includes `workspaceMemberId`). Pass the acting member using the existing `withActor` / `resolveActor` helpers.

**Metadata mutation shape** (POST `{TWENTY_BASE_URL}/metadata`; the shape is confirmed in Twenty source `twenty-shared/src/types/RelationCreationPayload.ts`):
```graphql
mutation { createOneField(input: { field: {
  objectMetadataId: "<agencyMessage id>", type: RELATION, name: "conversation", label: "Conversation", icon: "IconMessages",
  relationCreationPayload: { type: MANY_TO_ONE, targetObjectMetadataId: "<agencyConversation id>",
                             targetFieldLabel: "Messages", targetFieldIcon: "IconMessage" } } }) { id name } }
```
Rules:
- The join column is always `${name}Id`. The inverse ONE_TO_MANY field name is the camelCased `targetFieldLabel`.
- SELECT option values must be UPPER_SNAKE_CASE.
- A SELECT `defaultValue` is a quoted string, for example `"'OPEN'"`.
- Send option lists as GraphQL object literals, not escaped JSON. See the comment in `createSelectField`.
- `createRelationField` hard-codes `targetFieldLabel: "Scripts"`. **Parameterise it**; don't reuse it as it is.

### 5.3 `agencyCall` additions
- `notes` (TEXT) holds the dock's call notes. Add it to the PATCH allow-list in `routes/calls/index.ts:262-289`.
- `disposition` (SELECT) holds the user outcome: `INTERESTED`, `NOT_INTERESTED`, `CALLBACK`, `VOICEMAIL`, `WRONG_NUMBER`, `DNC`, `MEETING_BOOKED`, `NO_ANSWER`, … taken from `lib/call-outcome.ts`.
- Keep `status` as the **system** result (`IN_PROGRESS|COMPLETED|FAILED|NO_ANSWER|BUSY`). This is how Close separates system dispositions from outcomes, and it resolves bug #7.

### 5.4 Fix prospect notes
Add `notes` (TEXT) to `agencyProspect` and map `notes ↔ notes`. Stop reading and writing `outboundLabel` for notes (`map-prospect.ts:160,193`, `routes/prospects/index.ts:382`).

### 5.5 Regenerate the typed client
After the schema changes, run `bun run api:client` so genql picks up the new objects. Stop casting the client to `any` in new code.

---

## 6. Backend

### 6.1 Introspection script (write it first, run it, commit the output summary in the PR)
Create `scripts/introspect-twenty-messaging.mjs`:
- It loads `.env.local` and queries `POST {TWENTY_BASE_URL}/metadata`:
  ```graphql
  { objects(paging:{first:200}) { edges { node { id nameSingular namePlural isCustom
      fields(paging:{first:200}) { edges { node { name type isNullable options
        relation { type targetObjectMetadata { nameSingular } targetFieldMetadata { name } } } } } } } } }
  ```
- It prints `agencyConversation`, `agencyMessage`, `agencyCall` and `agencyProspect` with their fields and relations.
- It is read-only.

The server sits behind nginx basic auth for the UI. The backend already calls `/metadata` with only the Bearer key, so that path is reachable.

### 6.2 Messaging service: `backend/src/lib/twenty/messaging/index.ts`
Use raw GraphQL against `{TWENTY_BASE_URL}/graphql` with variables. Use the genql client after it has been regenerated.

```graphql
# Inbox
query Inbox($filter: AgencyConversationFilterInput, $after: String) {
  agencyConversations(filter: $filter, orderBy: [{ lastMessageAt: DescNullsLast }], first: 30, after: $after) {
    totalCount pageInfo { hasNextPage endCursor }
    edges { node { id name threadKey remoteNumber unreadCount starred status lastMessageAt lastMessagePreview
      lastMessageType lastMessageDirection agencyProspectId agencyLeadId agencyPhoneId
      agencyProspect { id name niche phone } agencyLead { id name } } } } }
# filter examples: { status: { eq: OPEN } }, { unreadCount: { gt: 0 } }, { starred: { eq: true } },
#                  { or: [{ name: { ilike: "%q%" } }, { remoteNumber: { ilike: "%q%" } }] }

# Contact's conversation(s)
query ContactThreads($pid: UUID, $lid: UUID) {
  agencyConversations(filter: { or: [{ agencyProspectId: { eq: $pid } }, { agencyLeadId: { eq: $lid } }] }) {
    edges { node { id threadKey remoteNumber unreadCount } } } }

# Thread, newest first (reverse in the UI); page backwards with `after`
query Thread($cid: UUID!, $after: String) {
  agencyMessages(filter: { conversationId: { eq: $cid } }, orderBy: [{ sentAt: DescNullsLast }, { createdAt: DescNullsLast }],
                 first: 50, after: $after) {
    pageInfo { hasNextPage endCursor }
    edges { node { id type direction status body fromNumber toNumber sentAt deliveredAt segments errorCode errorMessage media
      createdBy { workspaceMemberId name } agencyCallId
      agencyCall { id status disposition durationSeconds recordingUrl telnyxRecordingId transcriptionStatus summary notes } } } } }

# Writes
mutation UpsertConv($d: AgencyConversationCreateInput!) { createAgencyConversation(data: $d, upsert: true) { id } }   # keyed by threadKey
mutation AddMsg($d: AgencyMessageCreateInput!) { createAgencyMessage(data: $d, upsert: true) { id } }               # keyed by externalId
mutation MsgStatus($ext: String!, $d: AgencyMessageUpdateInput!) {
  updateAgencyMessages(filter: { externalId: { eq: $ext } }, data: $d) { id } }
mutation MarkRead($id: UUID!) { updateAgencyConversation(id: $id, data: { unreadCount: 0 }) { id } }
```
- REST equivalents use `fetchTwenty` / `listTwenty`, for example `agencyMessages?filter=conversationId[eq]:"<id>"&order_by=sentAt[DescNullsLast]&limit=50&starting_after=<cursor>`.
- Limits: 200 records per page, 60 per batch, about 100 requests per minute on Twenty Cloud.

### 6.3 Routes: `backend/src/routes/messages/index.ts`, mounted at `/api/messages` and `/api/conversations` in `backend/src/index.ts`

| Route | Does |
|---|---|
| `GET /api/conversations?tab=unread\|all\|starred&q=&after=` | Inbox |
| `GET /api/conversations/by-contact/:type/:id` | Finds or creates the thread by the contact's primary phone (`phone:{E164}`), linking prospect or lead |
| `GET /api/conversations/:id/messages?after=` | Thread, with call pointers expanded |
| `POST /api/conversations/:id/read` / `PATCH /api/conversations/:id` | Mark read; star or archive |
| `POST /api/messages/send {conversationId? , contactType, contactId, fromPhoneId, to, body}` | 1) resolve or upsert the conversation. 2) create the `agencyMessage` with `status: SENDING`. 3) Telnyx `POST https://api.telnyx.com/v2/messages` `{ from, to, text, messaging_profile_id: phone.messagingProfileId ?? TELNYX_MESSAGING_PROFILE_ID|_US, webhook_url: <server>/api/webhooks/telnyx?token=… }`. 4) store `externalId = data.id`, `status: QUEUED`. 5) update the conversation's `lastMessage*`. 6) if `outboundLabel` is in (empty, `NEEDS_*`, `READY_FOR_SMS`), set it to `SMS_IN_PROGRESS` — keeps the current pipeline behaviour from `website-sent`. 7) when the composer sends with the website template selected, also write the template and offer URLs |
| `POST /api/messages/note` | Creates `type: NOTE` on the thread |

### 6.4 Telnyx webhook additions (`routes/telnyx/webhook/index.ts`)
- **`message.received`**:
  1. Upsert the conversation by `phone:{from}`. If it's new, find the contact by phone (`agencyProspects` `phone` / `primaryPhone.primaryPhoneNumber`, then `agencyLeads`) and link it.
  2. Upsert the message (`externalId`, `INBOUND`, `RECEIVED`, `body`, `media`, `segments = parts`).
  3. Set `lastMessage*` and `unreadCount + 1`.
  4. If the body is `STOP` or `UNSUBSCRIBE`, set the prospect `coldCallStatus` → DNC.
- **`message.sent`** / **`message.finalized`**: `updateAgencyMessages(filter: externalId eq)`, mapping `to[0].status` → status, setting `deliveredAt`, and `errors[0]` → `errorCode` / `errorMessage`.
- **Calls**: in `POST /api/calls` (row created) and after the disposition is saved, upsert a `type: CALL` pointer message on the contact's conversation (`agencyCallId`) and refresh `lastMessage*`. `call.recording.saved` needs no change to messages; the thread expands the call row.
- Respond 200 quickly. Telnyx retries, and `externalId` uniqueness makes those retries safe.

### 6.5 Live updates
- Twenty's GraphQL subscription (`onEventSubscription`) **rejects API keys**, so the backend cannot subscribe.
- **v1:** React Query `refetchInterval`: 5s for the open thread, 15s for the inbox.
- **v2:** a Twenty webhook (`agencyMessage.created`, `agencyConversation.updated`; register it with the metadata `createWebhook`; verify the `X-Twenty-Webhook-Signature` HMAC as in `routes/twenty/webhook/helpers/verify-signature.ts`) plus the Telnyx webhook, forwarded to an SSE endpoint `GET /api/stream`.

---

## 7. Frontend data hooks
- `frontend/src/lib/api-client/index.ts`: add `conversations.{list, byContact, messages, read, update}` and `messages.{send, note}`.
- `frontend/src/hooks/use-conversations.ts`:
  - `useInbox(tab, q)` with `useInfiniteQuery`;
  - `useContactConversation(type, id)`;
  - `useThread(conversationId)`, infinite, reversed;
  - `useSendMessage()`, optimistic: insert a `SENDING` bubble, then roll back to `FAILED` with Retry.
- `useCallsForRecord`: add `GET /api/calls?prospectId=|leadId=` that filters server-side (`agencyCalls?filter=agencyProspectId[eq]:…`) instead of loading the whole table.
- `useContactFeed(type, id)`: merges the thread, calls not yet pointed to, and activity into one sorted list for `ContactFeed`.

---

## 8. Phases and acceptance criteria

| Phase | Scope | Done when |
|---|---|---|
| **0. Fixes** | Bugs #3, #5, #8, #9, #10 from §2; check #7 against the live schema | Notes no longer touch `outboundLabel`; no `console.log`; phone cache refreshes after a call |
| **1. Global dialer** | §4.1. Split Softphone into `components/dialer/*`; DialerProvider in Layout; top-bar button; dock with idle, in-call and summary views, settings and incoming; PowerDialer on `useDialer`; `agencyCall.notes` / `disposition` | Start a call on a contact, navigate to Reports: the call continues and the dock shows a timer. An inbound call rings while idle. Notes and disposition are saved on the call row. Power dialer Next works. Claim and release behaviour is unchanged (409 when the number is held) |
| **2. Messaging data** | §6.1 introspect; §5 schema (only what is missing); `api:client` regenerated; §6.2-6.4 service, routes and webhook | `POST /api/messages/send` delivers a real SMS through Telnyx and the row moves QUEUED → SENT → DELIVERED. An inbound reply creates or links a conversation and a message, `unreadCount` increments, and replaying the same webhook does not duplicate anything |
| **3. Contact workspace** | §4.2. `ContactPage` for prospects and leads; sidebar, feed, composer, rail; `ContactWorkspaceSkeleton`; remove `ProspectDetailPage` / `LeadDetailPage` / `SendWebsiteWidget` composer | Page matches the house style (§3) and the reference layout (`ghl-01`). Calls, SMS and notes interleave by time. Recording and transcript play inline. Composer shows segment counts and sends. Inline field edits save optimistically. Under 760px it collapses to one pane |
| **4. Inbox** | §4.3 `/conversations`, nav badge, unread and star | Unread, All and Starred lists work; opening a thread marks it read; the composer works there too |
| **5. Polish (optional)** | Transfer, voicemail drop, Twenty-webhook SSE, Tasks/Notes rail tab, local-time hint (`close-07`) | |

**Verification for every phase:**
- `bun run build` (shared, backend, frontend) and the existing tests: `lib/*.test.ts`, `backend/**/*.test.ts`.
- `bun run check:docs`, `bun run check:secrets`.
- Click through the flow in the browser. Use `?simulate=1` (`SIMULATE_CALLS`) for dialer UI work without Telnyx.
- Update the docs: `docs/diagrams/data-model.mmd` (add both objects and their relations), `docs/architecture.md`, and the README data-model section.

## 9. Do not
- Store anything outside Twenty. The architecture rule is that Twenty is the only database.
- Create the messaging objects a second time if introspection shows they exist; adapt to them instead.
- Break the phone claim lock (`POST /phones/:id/claim` → 409). Read `docs/architecture.md` before touching it.
- Copy vendor branding, colours or icons from the screenshots.
- Hard-code card heights. Panes are flex and scroll internally.

## 10. Sources
- Twenty: [API docs](https://docs.twenty.com/developers/extend/api), [webhooks](https://docs.twenty.com/developers/extend/webhooks), [relations](https://docs.twenty.com/developers/extend/apps/data/relations), [messaging channels (why we are not using native Message)](https://docs.twenty.com/developers/extend/apps/logic/messaging-channels), and source `twentyhq/twenty` at commit `b83943ab` (RelationCreationPayload, get-resolver-args, filter input types).
- Telnyx: [messaging webhooks](https://developers.telnyx.com/docs/messaging/messages/receiving-webhooks) (`message.received/sent/finalized`, `to[].status`, `parts`, `errors`), and `docs/telnyx/` in this repo.
- GoHighLevel: [Conversations API OpenAPI](https://raw.githubusercontent.com/GoHighLevel/highlevel-api-docs/main/apps/conversations.json). Our conversation and message fields mirror its Conversation (`unreadCount`, `starred`, `lastMessageType/Direction/Date`) and Message (`direction`, `messageType`, `status`, `meta.callDuration/callStatus`) models.
- Close: [Call activity API](https://developer.close.com/resources/activities/call/) (system `disposition` vs `outcome_id`), [SMS activity API](https://developer.close.com/resources/activities/sms/).
- UI screenshots: `docs/references/dialer-ui/README.md`, which lists every source URL.
