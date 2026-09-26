# SendWebsiteWidget — Build Plan

## 0. Goal

Add `frontend/src/components/website/SendWebsiteWidget.tsx` to
`frontend/src/pages/ProspectDetailPage.tsx` so an operator can:

1. Inspect the current prospect (industry/niche, website, slug).
2. See video-page status (offer video preferred, prospect video fallback) + open links.
3. Send two pages: (A) static template redesign preview, (B) dynamic offer funnel.
4. Use the correct `agencyPhones` sending number (IE→IE, US→US, never cross).
5. Copy + SMS-draft an editable message, log "sent + asked to look", then push down the offer path.
6. See the video-agent pipeline as a visible-but-blocked placeholder until it is runnable.

Day-1 must work with **zero** `agencyPhones` rows and **zero** Telnyx keys
(manual `sms:` draft + clipboard + sent log). Phase-2 lights up real Telnyx sends.

---

## 1. Ground truth (verified read-only)

### 1.1 `agencyProspect` (Twenty, 741 rows)

Live metadata (`POST /metadata`):

```
label SELECT [AUTO_PAINT_AND_BODY_SHOPS, WINDOW_TINTING, AUTO_DETAILING, GENERAL_TRADES]
niche TEXT (raw, e.g. "Auto Paint & Body Shops")
slug TEXT, website TEXT, phone TEXT
phoneNumber PHONES {primaryPhoneNumber, primaryPhoneCountryCode, primaryPhoneCallingCode, additionalPhones[]}
primaryPhone PHONES (same shape)
phoneValid BOOLEAN
smsMetadata RAW_JSON (SmsMetadata, null until pipeline writes)
outboundState SELECT [NEW,ENRICHED,VIDEO_READY,QUEUED,SENDING,AWAITING_DELIVERY,AWAITING_REPLY,REPLIED,QUALIFIED,BOOKED,COMPLETED,PAUSED,OPTED_OUT,FAILED]
outboundLabel SELECT [NEEDS_ENRICHMENT,NEEDS_VIDEO,READY_FOR_SMS,SMS_IN_PROGRESS,FOLLOW_UP_DUE,HUMAN_REVIEW,POSITIVE_REPLY,NEGATIVE_REPLY,DO_NOT_CONTACT,DELIVERY_FAILED]
whatsappStatus SELECT [PENDING,VALIDATED,REJECTED]
videoStatus SELECT [NONE,QUEUED,RECORDING,RENDERED,ATTACHED,FAILED]
videoSource TEXT, videoError TEXT
videoUrl LINKS {primaryLinkLabel, primaryLinkUrl, secondaryLinks[]}
coldCallStatus SELECT [NEW,CONTACTED,INTERESTED,NOT_INTERESTED,CALLBACK,CONVERTED,DO_NOT_CONTACT]
campaignId RELATION, ghlWebhookUrl TEXT
```

Sampled live row: `smsMetadata/outboundState/outboundLabel/phoneValid/videoStatus` null,
`whatsappStatus="PENDING"`, `videoUrl` present-but-empty, PHONES composites present-but-empty.

Industry derivation (`ui-kit/lib/template-sites/industry.ts` → `industryFromLead`):
raw `niche` → alias match → `labelValue`
(`AUTO_PAINT_AND_BODY_SHOPS`, `WINDOW_TINTING`, `AUTO_DETAILING`, fallback `slugify(niche)`).
Canonical for URL `:industryId` + template pack: **`labelValue ?? slugify(niche)`**,
display raw `niche` alongside.

### 1.2 `agencyOffer` (Twenty, `name == prospectId` join, no relation field)

```
id UUID, title TEXT, heroH1 TEXT, heroLede RICH_TEXT {markdown, blocknote}
videoUrl LINKS {primaryLinkUrl, primaryLinkLabel}
ctaType SELECT, status SELECT [DRAFT,ACTIVE,PAUSED]
prospectId stored in `name`, agencyCampaignId optional
```

Lookup: `GET /agencyOffers?limit=1&filter=name[eq]:<prospectId>`
(`ui-kit/lib/agency-offers/client.ts`, `apps/web/src/lib/twenty-proxy-client.ts`).

### 1.3 Three systems — do not conflate

| System | What it is | Serves |
|---|---|---|
| `../open-offer-builder` | Dynamic funnel on `agencyOffers` (quiz → `agencyLead` → Calendly → booked, `{{area}}` tokens) | `/offer/prospect/<prospectId>` (Vercel), internal Railcode port has no public funnel |
| `../ui-kit/templates/**` | Static redesign packs (`tint/*.html`, `plumbing/*`) | Video-agent `--generated-url` / `--pack-dir` second half |
| `../ui-kit/apps/web /offer/:industryId/:uuid` | Thin iframe shell (`offer-funnel-page.tsx` + `funnel.ts` → `FUNNEL_PROSPECT_BASE`) | Forwards UTMs/`visitor_id` to offer-builder; `:industryId` cosmetic, `:uuid` real key |

### 1.4 `agencyPhone / agencyPhones` (Twenty, **0 rows live**)

Live metadata:

```
phoneNumber TEXT, name TEXT, countryCode TEXT
numberType SELECT [LONG_CODE,TOLL_FREE,SHORT_CODE]
state SELECT [ACTIVE,PAUSED,DEGRADED,RETIRED]
messagingProfileId TEXT, tenDlcCampaignId TEXT, tollFreeVerificationId TEXT
lastSyncedAt TEXT, eligibleProducts RAW_JSON, features RAW_JSON, health RAW_JSON
```

`GET /rest/agencyPhones?limit=5 → totalCount=0`.

Mismatch to fix: `backend/src/routes/twentyPhones.ts` + `PhoneNumbersPage.tsx`
expect `provider/city/country/status` (do not exist). Remap:

```
phoneNumber ← phoneNumber || name
country ← countryCode
status ← state
provider ← numberType (+ tenDlc/tollFree ids)
profile ← messagingProfileId
```

### 1.5 Dialer gaps today

* `backend/src/routes/prospects.ts GET /:id` drops `slug, niche detail, label, smsMetadata,
  outboundState/Label, videoStatus/Source/Error/Url, PHONES composites`.
* `Softphone.tsx` uses static SIP env `VITE_SIP_CALLER_ID`, no `agencyPhones` selector.
* No SMS send path (only `sms:` drafts). ui-kit pipeline owns `smsMetadata` + Telnyx.

---

## 2. Telnyx (provider = Telnyx, env-driven)

* Send: `POST https://api.telnyx.com/v2/messages`,
  `Authorization: Bearer TELNYX_API_KEY`, `{from, to, text}` (E.164).
* Messaging Profile = inbound/outbound config; a number is SMS-enabled by
  assignment to a profile (Portal → Programmable Messaging → Add New Profile).
* `POST /messaging_profiles` requires `name` + `whitelisted_destinations` (ISO alpha-2,
  `["*"]` = all); optional `webhook_url/failover_url/api_version`,
  `number_pool_settings`, `alpha_sender`, `daily_spend_limit*`,
  `mms_fall_back_to_sms`, `mms_transcoding`.
* Use `sticky_sender:true` (+ `geomatch`, `skip_unhealthy` for pools),
  `smart_encoding:true` for conversational/support traffic.
* Since 2024-03-01: editing/creating a profile requires whitelisted countries;
  non-US destinations require a default alphanumeric sender ID.
* Webhooks: `message.sent → message.finalized`, inbound `message.received`.
  STOP auto-unsubscribes; long SMS auto-concatenates.
* MMS only US/CA long-code/toll-free/short-code → IE sends are SMS-only.
* Bring-up: purchase/port SMS numbers → profile + 10DLC (US) → test → scale.

Backend env (never frontend):

```bash
TELNYX_API_KEY=...
TELNYX_MESSAGING_PROFILE_ID=...   # default
TELNYX_MESSAGING_PROFILE_IE=...   # whitelisted ["IE","GB"] + alpha_sender
TELNYX_MESSAGING_PROFILE_US=...   # whitelisted ["US"] + 10DLC brand/campaign
TELNYX_WEBHOOK_URL=https://<backend>/api/messages/webhook
```

Also fix `backend/.env.local`: currently placeholder `your-…` (dialer REST → 401);
needs the real Twenty JWT (ui-kit `.env.local` holds the working one).

---

## 3. Widget spec — `SendWebsiteWidget.tsx`

Location: `frontend/src/components/website/SendWebsiteWidget.tsx`
Mount: `ProspectDetailPage.tsx` second row, full-width `WidgetCard title="Send Website" icon=Globe`.
Props: `prospect` (extended shape below).

### 3.1 Sections

1. **Context strip:** Industry badge (`labelValue` + raw `niche`), website link, slug,
   `coldCallStatus` + `outboundState/Label` chips.
2. **Video status (both, prefer offer):**
   `videoStatus` badge + `videoError` if `FAILED`;
   Row O: `offer.videoUrl.primaryLinkUrl [Open] [Copy]`;
   Row P (fallback): `prospect.videoUrl.primaryLinkUrl [Open] [Copy]`;
   both empty → "No video yet".
3. **Two sendable pages:**
   * A — Template preview: `templates/<pack>/index.html` from `labelValue→pack`
     (`AUTO_*→autobody`, `WINDOW_TINTING→tint`, `AUTO_DETAILING→detailing`).
     `[Copy link] [Preview]`.
   * B — Offer funnel: display `/offer/<industryId>/<slug>`,
     actual `FUNNEL_PROSPECT_BASE + prospect.id`. `[Copy link] [Open offer]`.
     Missing offer → "No offer yet" (no auto-create day-1).
4. **From-number selector (top):**
   `api.twentyPhones.list()` → filter `state==ACTIVE`,
   default `countryCode == prospectCountry` (`+353→IE`, `+1→US`),
   else first active + `US→IE warning: blocked unless overridden` warning.
   `totalCount==0` → "No sending numbers — add IE + US rows in Twenty agencyPhones
   and assign each to its Telnyx profile (paste ID into `messagingProfileId`)".
   Selected number flows to SMS composer `From:` line and to `Softphone callerId`
   (`P-Asserted-Identity`/displayName override).
5. **Video-agent placeholder (blocked, visible):**
   Disabled "Generate walkthrough (coming soon)" + text:
   `run.py --start-url <website> --generated-url <templateUrl> --pack-dir <pack>`
   `→ Cap + cursor.json → ffmpeg → R2 → patch videoUrl + videoStatus`.
   Tooltip: needs headed desktop/Cap; fails loud, never fake-attaches.
6. **Message composer (prerequisite + editable copy):**
   `<textarea>` prefilled:
   `Hey {{firstName}} — made you a quick look at {{templateUrl}} … have a look,`
   `then I'll send the offer path {{offerUrl}} — sent from {{agencyNumber}}`.
   Primary: "Copy + SMS draft" → `sms:<phone>?body=<encoded>` + clipboard.
   Log: `POST website-sent {prospectId, templateUrl, offerUrl, fromNumber}` →
   `website_sent_at/sent_url/from_number` note + "Sent ✓ asked to look" state.
   Secondary: "Mark down offer path" → note/`coldCallStatus` advance.

### 3.2 Backend changes (`backend/src/routes/`)

* `prospects.ts GET / + GET /:id`: stop dropping fields — include
  `slug, niche, label, labelValue, website, phone + phoneNumber/primaryPhone composites,
  smsMetadata, outboundState/Label, phoneValid, whatsappStatus,
  videoStatus/Source/Error/Url`.
* `twentyPhones.ts`: remap to live shape (§1.4); return
  `{id, phoneNumber, name, countryCode, numberType, state, messagingProfileId,
  tenDlcCampaignId, tollFreeVerificationId}`.
* New `GET /api/prospects/:id/website-status` (server holds `TWENTY_API_KEY`):
  prospect messaging/video block + `agencyOffers?filter=name[eq]:id` offer block +
  `{templateUrl, offerUrl, funnelSrc, industryId, pack}`.
* New `POST /api/prospects/:id/website-sent {templateUrl, offerUrl, fromNumber, body}`:
  timeline/note stamp (day-1, no Telnyx key needed).
* Phase-2 only: `POST /api/messages/send {to, fromNumberId, text}` → Telnyx
  `/v2/messages` with per-country profile + `smsMetadata`/`outboundState` writeback,
  consent/STOP enforcement.

### 3.3 Frontend wiring

* Extend `frontend/src/lib/apiClient.ts` (`twentyPhones.list` shape, `prospects.get`
  extended type, `websiteStatus`, `websiteSent`).
* `Softphone` accepts `callerId?: string` (selected `agencyNumber`).
* Empty/loading/error states reuse `Spokes`, `Badge`, `WidgetCard` patterns
  (`CallScriptWidget.tsx` reference).

---

## 4. Verification

* `tsc` clean; widget renders with/without offer, with/without video,
  with/without `agencyPhones` (0-row empty state).
* Per industry (`AUTO_PAINT_AND_BODY_SHOPS`, `WINDOW_TINTING`, `AUTO_DETAILING`,
  `GENERAL_TRADES`): offer + video links resolve HTTP 200; correct From default;
  mismatch warns/blocks; sent-state persists after refetch.
* `GET /api/twenty/phones` returns live-mapped rows once IE + US numbers are added
  in Twenty; `GET /rest/dashboards` + `/api/health` unaffected.

---

## 5. Sequencing

1. Backend: extend prospect shape + remap phones + `website-status` + `website-sent`.
2. Frontend: `SendWebsiteWidget` (context, video both-prefer-offer, two pages,
   From-selector, blocked pipeline button, composer + sent log).
3. `ProspectDetailPage` mount + `Softphone callerId` passthrough.
4. Twenty data: add 1×IE + 1×US `agencyPhones` rows with `messagingProfileId`s.
5. Phase-2 (separate): Telnyx send + webhooks + `smsMetadata` writeback + 10DLC.

---

## 6. Todos

### Backend
- [x] Extend `prospects.ts GET / + GET /:id` to include `slug, niche, label/labelValue, website, phone + phoneNumber/primaryPhone composites, smsMetadata, outboundState/Label, phoneValid, whatsappStatus, videoStatus/Source/Error/Url`
- [x] Remap `twentyPhones.ts` to live shape (`phoneNumber, name, countryCode, numberType, state, messagingProfileId, tenDlcCampaignId, tollFreeVerificationId`)
- [x] Add `GET /api/prospects/:id/website-status` (prospect block + `agencyOffers?filter=name[eq]:id` offer block + `templateUrl, offerUrl, funnelSrc, industryId, pack`)
- [x] Add `POST /api/prospects/:id/website-sent {templateUrl, offerUrl, fromNumber, body}` timeline/note stamp
- [x] Backend env OK — root `.env.local` holds the live Twenty JWT (`backend/.env.local` placeholder is unused; `index.ts` loads root)

### Frontend
- [x] Create `frontend/src/components/website/SendWebsiteWidget.tsx` (context strip, dual video prefer-offer, two pages, From-selector, blocked video-agent button, editable composer + sent log)
- [x] Mount widget in `ProspectDetailPage.tsx` second row full-width `WidgetCard`
- [x] Extend `frontend/src/lib/apiClient.ts` (`twentyPhones` shape, extended prospect type, `websiteStatus`, `websiteSent`)
- [x] Pass selected `agencyNumber` into `Softphone` as `callerId` override (`P-Asserted-Identity`/displayName)
- [x] Handle empty states (no offer, no video, zero `agencyPhones`) + loading/error with `Spokes`/`Badge`/`WidgetCard`

### Twenty data
- [ ] Add 1×IE `agencyPhones` row (`countryCode=IE`, `state=ACTIVE`, `messagingProfileId` = IE profile)
- [ ] Add 1×US `agencyPhones` row (`countryCode=US`, `state=ACTIVE`, `messagingProfileId` = US profile)
- [ ] Verify `GET /api/twenty/phones` returns both rows mapped correctly

### Telnyx Phase-2 (separate)
- [ ] Set `TELNYX_API_KEY`, `TELNYX_MESSAGING_PROFILE_IE/US`, `TELNYX_WEBHOOK_URL` in backend env
- [ ] Add `POST /api/messages/send {to, fromNumberId, text}` → Telnyx `/v2/messages` with per-country profile
- [ ] Write back `smsMetadata` + `outboundState`, enforce consent/STOP handling

### Verification
- [x] `tsc` clean (backend `tsc --noEmit`, frontend `tsc -b`), widget renders with/without offer/video/phones
- [ ] Per industry (`AUTO_PAINT_AND_BODY_SHOPS`, `WINDOW_TINTING`, `AUTO_DETAILING`, `GENERAL_TRADES`) offer + video links HTTP 200, correct From default, mismatch warns/blocks, sent-state persists

---

## 7. Railcode port (`railcode/` app, live as `cold-dialer` — active/private)

The `frontend/` + `backend/` work above does NOT deploy to Railcode (no `railcode.json`
there). Ported 1:1 into `railcode/` (Hono worker + Vite client, Twenty via org
`twenty` connector, platform auth — no API key, no Postgres):

### Server (`railcode/server/index.ts`)
- [x] `selectValue` / `slugifyIndustryValue` / `packForIndustry` / `FUNNEL_PROSPECT_BASE` helpers
- [x] `prospectToFrontendList` + `GET /api/prospects/:id` extended (slug, niche, label/labelValue, messaging + video blocks)
- [x] `GET /api/twenty/phones` remapped to live shape (`countryCode, numberType, state, messagingProfileId…`) + back-compat aliases
- [x] `GET /api/prospects/:id/website-status` (offer lookup `filter=name[eq]:id`, computed urls)
- [x] `POST /api/prospects/:id/website-sent` (best-effort `outboundLabel→SMS_IN_PROGRESS`, receipt echo)

### Client (`railcode/frontend/src/`)
- [x] `lib/apiClient.ts`: `websiteStatus` + `logWebsiteSent` typed methods
- [x] `components/website/SendWebsiteWidget.tsx` (same spec as §3.1)
- [x] `pages/ProspectDetailPage.tsx`: extended `Prospect` type, `agencyFromNumber` state, widget row, `Softphone callerId`
- [x] `components/softphone/Softphone.tsx`: optional `callerId` prop → `P-Asserted-Identity`/displayName override
- [x] `npx tsc --noEmit` clean

### Still to do
- [x] `railcode deploy` — live at `https://cold-dialer.listeningkit.railcode.app/`
- [ ] Verify widget on the live URL (prospect detail page renders Send Website row)
- [ ] Twenty data: 1×IE + 1×US `agencyPhones` rows (live `totalCount=0`)

### Copy v2 (single SMS, no person name, GSM-7 only)
- Template available: `Here's the website we built out for you: {templateUrl} - have a look, then here's the offer path: {offerUrl}`
- No template pack: `We made a video on how we made it and how we could help you out: {offerUrl} - have a look`
- Rules: `name` is the business (never split into a person); all links absolute; From-selector widget-only, never in copy.

### Offer funnel — redeployed under new Vercel account (2026-09-11)
- Account: `maxkentan21-6364` / scope `listeningkit`; project `listeningkit/open-offer-builder` (`prj_fne5pASrQyK3eoGzTgbn4OTn20CJ`). Old linkage backed up at `open-offer-builder/.vercel.old-org-backup/`.
- No code adaptation needed: public routes (`/offer`, `/offer/:slug`, `/offer/prospect/:prospectKey`) + `by-prospect` API already existed.
- Production env: `TWENTY_BASE_URL`, `TWENTY_API_KEY`, `JWT_SECRET` set; `TWENTY_DATABASE_URL` omitted (unreachable from Vercel — login degrades, public funnel unaffected); `VITE_API_URL` unset (same origin).
- Live: `https://open-offer-builder-chi.vercel.app` — verified `/api/health` 200 (`apiKeyConfigured:true`), `/api/public/offers/default` 200 with real payload, `/offer/prospect/<id>` 200 shell, `by-prospect` clean 404 when unlinked.
- Dialer `FUNNEL_PROSPECT_BASE` (both trees) + redeployed `cold-dialer` point at the new domain.
- Funnel base is env-driven everywhere: ui-kit `VITE_FUNNEL_BASE_URL` (`.env.local` + `.env.example`, read by `funnel.ts` + `use-funnel-height.ts` origin check); Express backend `FUNNEL_BASE_URL` (`.env.local` + `.env.examples`, falls back to chi domain); `cold-dialer` worker keeps a constant mirroring it (workers have no env).
- Old deployment (`open-offer-builder.vercel.app`) is 402-paused upstream, same as `listeningkit-frontend-web`.

### Template lineup: slug is the key (2026-09-11)
- Template sites resolve by SLUG like the funnel (`/{industryId}/{slug}/`), uuid fallback: new vercel.json slug rewrites (after uuid/templates rules) + `template-uuid-file.ts` accepts uuid (`getAgencyProspectById`) or slug (exact server-side `slug[eq]` filter + normalize, no 200-row scan).
- Widget `templateUrl` (both dialer trees) = `{BASE}/{industryId}/{slug}` (uuid fallback), no trailing slash (rewrites match slash-less paths).
- Verified on phi: slug 200 filled (`White Sands` + `Alamogordo` present, zero `{{` tokens), uuid 200, bogus slug JSON `prospect_not_found`.
- Also fixed: phi Root Directory is `apps/web` so its vercel.json (rewrites + dispatch function) governs; root `vercel.json` alone serves static-only with dead `/api`.
- `VITE_FUNNEL_BASE_URL` set on phi (Production); phi redeployed; `cold-dialer` redeployed with slug lineup.
