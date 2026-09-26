# Industry-Canonical Plan — agencyProspect / agencyCampaign / agencyOffer consolidation

Decisions locked with user (2026-09-11):
- Industry linkage: `industryId` SELECT on campaign + offer (no RELATION fields).
- Canonical phone: `phoneNumber` PHONES (`phone` TEXT = legacy fallback).
- Phantom fields: create `utmSource` on campaign; drop `campaignType`/`copyTemplate` reads.
- One `agencyCampaign` per industry owning the industry offer + video.

## Repo placement (read this first)
- **ui-kit**: Twenty schema + lib (`agency-offers`, `agency-campaigns` clients), `offers-render`, template routes, Phase 0 ensure script. done: Phase 0 + Phase 1 done here.
- **open-offer-builder**: funnel + builder — `by-prospect` industry resolution, `PreviewPage` effective-video, `OfferDetailPage` industry switcher + video-source picker, offer seed/ensure endpoints. ← Phase 2 (first half) + Phase 3 live here.
- **dialer / railcode**: widget + `website-status` consumers only. ← Phase 2 (second half).

## 0. Baseline — live Twenty metadata (pulled read-only, 2026-09-11)

### agencyCampaigns — nearly empty
`name` TEXT, `status` SELECT `[ACTIVE,INACTIVE,DRAFT]`, relations
(`prospects`, `leads`, `scripts`). NO `industryId`, NO `utmSource`/`campaignType`,
NO `copyTemplate` — yet code reads all of them (silent `undefined`).

### agencyProspect — holds everything (same fact 2-3 ways)
- Industry: `niche` TEXT (raw) + `label` SELECT `[AUTO_PAINT_AND_BODY_SHOPS, WINDOW_TINTING, AUTO_DETAILING, GENERAL_TRADES]`.
- Phone: `phone` TEXT + `phoneNumber` PHONES + `primaryPhone` PHONES.
- Website: `website` TEXT + `websiteUrl` TEXT + `websiteUrlPrimary` LINKS.
- Email: `email`/`email2`/`email3` TEXT + `primaryEmail` EMAILS.
- Google: `googleBusinessUrl` TEXT + `googleBusinessUrlPrimary` LINKS (+ placeId/cid/reviewsUrl).
- Pipeline state (6 axes): `coldCallStatus`, `outboundState`, `outboundLabel`, `qualificationStatus`, `enrichmentStatus`, `whatsappStatus` (+ `videoStatus`).
- Video (single copy, fine): `videoStatus`/`videoSource`/`videoError`/`videoUrl`.
- Identity: `name` = BUSINESS name (never split into a person — the "Hey GN" rule).

### agencyOffers — content only
hero/quiz/calendly/configs/`videoUrl`; join by `name==prospectId` convention.
NO `agencyCampaignId`, NO `prospectId`, NO `videoMode`, NO `industryId` (all to be added except campaign relation, which we skip by decision).

### What works today (keep)
`prospect.campaignId → campaign`, `agencyLead.campaignId` + `.agencyProspect`,
`campaign.prospects/leads/scripts` reverse relations, per-prospect video pipeline
(`run.py` token inference from prospect record — unchanged).

## 1. Canonical rules (freeze, don't delete — Twenty field deletion is destructive)

- Industry: `prospect.label` SELECT wins; `niche` display-only.
- Phone: `phoneNumber.primaryPhoneNumber` wins; `phone` TEXT fallback; `primaryPhone` frozen.
- Website: `website` TEXT wins; `websiteUrl*` frozen.
- Email: `primaryEmail` wins; `email2/3` frozen.
- Industry key mapping (mirror ui-kit `INDUSTRY_PACKS`): `AUTO_PAINT_AND_BODY_SHOPS→autobody`, `WINDOW_TINTING→tint`, `AUTO_DETAILING→detailing`, `GENERAL_TRADES→general`.
- Offer rows: `name=INDUSTRY:{industryId}` (e.g. `INDUSTRY:autobody`); served always (industry-only lookup; per-prospect rows kept dormant, never deleted).
- Effective video: `offer.videoMode==CUSTOM && offer.videoUrl ? offer.videoUrl : prospect.videoUrl`.

## 2. Todos

### Phase 0 — Metadata + backfill (Twenty `/metadata`, idempotent ensure-scripts)
- [x] Create `agencyCampaigns.industryId` SELECT (same 4 options as prospect `label`)
- [x] Create `agencyOffers.industryId` SELECT (same 4 options)
- [x] Create `agencyOffers.videoMode` SELECT `[PROSPECT, CUSTOM]`
- [x] Create `agencyCampaigns.utmSource` SELECT `[OUTBOUND, INBOUND, BLENDED]`
- [x] Backfill 4 `agencyCampaign` rows (Autobody/Tint/Detailing/General) with `industryId` + `utmSource=OUTBOUND`
- [x] Link prospects to industry campaigns via `campaignId` (741/741 linked)
- [x] Create 4 `INDUSTRY:{id}` offer rows (`videoMode=PROSPECT`, neutral hero copy, `status=ACTIVE`)
- [x] Backfill `videoMode=PROSPECT` on all existing per-prospect offers
- Script: `ui-kit/apps/web/scripts/ensure-industry-canonical.ts` (`--dry-run`, `--link-prospects`; 429 backoff + 700ms throttle)

### Phase 1 — ui-kit lib (read the real schema) done: done
- [x] `agency-campaigns/schema+client`: parse `industryId`/`utmSource`; dropped `copyTemplate` read + schema field + proxy-client line (was parsed, never consumed)
- [x] `agency-offers/schema+client`: parse `industryId`/`videoMode`; added `getIndustryOffer(industryId)` (`filter=name[eq]:INDUSTRY:{id}`) + `resolveEffectiveVideoUrl(offer, prospectVideoUrl)`
- [x] `offers-render.ts`: industry offer lookup replaces fuzzy prospect-name matcher (+ `videoMode`/`videoUrl` parse)
- [x] Typecheck: app config clean except pre-existing `analytics/attribution.ts` error; api config clean

### Anti-const-default rule (2026-09-11)
Runtime code reads rows, never hardcodes: campaign rows own `urlKey`/`funnelBaseUrl`/`templateBaseUrl`/`packDir`
(new TEXT fields, backfilled on all 4 campaigns). `FUNNEL_*`/`TEMPLATE_*` constants + label→key tables deleted from
Express + worker; dead env vars removed from dialer `.env*`. Missing rows → explicit nulls/states
("Industry not configured — link an industry campaign"), never invented URLs. Seed copy in scripts is initial
data, kept neutral and minimal.

### Phase 2 — Serve paths (open-offer-builder FIRST, then dialers)
- [x] Chi `public.ts` `by-prospect`: industry routing from campaign row (linked campaign → `industryId[eq]` filter); `INDUSTRY:{urlKey}` offer; video resolver; payload gains `prospectId`/`industryId`/`videoMode` (fixes Quiz attribution which read `name`)
- [x] Chi `offers.ts` POST/PATCH whitelist: `industryId`, `videoMode`
- [x] Chi `PreviewPage.tsx`: no change needed (consumes resolved `videoUrl`)
- [x] Dialer `website-status` (Express + Hono): campaign-row routing, industry offer, resolved video, `phoneE164` (composite-first), `industryKey` in urls
- [x] `ensure-offer` (both): ensures the `INDUSTRY:{key}` row (neutral seed copy), never per-prospect rows
- [x] Removed `campaignType` reads in both dialer trees (derive display from `industryId`/`status`)
- [x] Canonicalized dup reads: `phoneNumber` → `phone`; `website` → `websiteUrl*`; `label` → `niche`

### Phase 3 — Builder + widget UI (open-offer-builder + dialers)
- [ ] `OfferDetailPage.tsx`: industry switcher loading `INDUSTRY:{id}` rows; prospect picker → read-only context
- [ ] `OfferDetailPage.tsx`: Floating-UI video-source picker (`PROSPECT` default / `CUSTOM` URL) writing `videoMode` + `videoUrl`
- [x] Dialer `SendWebsiteWidget` (both trees): composer branches on industry offer presence; Card B "Create industry offer" (ensure mutation); Card A explicit unconfigured state; smsHref prefers `phoneE164`
- [ ] SMS copy unchanged (URL shapes identical)

### Phase 4 — Verify + ship
- [x] Metadata: 4 new campaign fields + 2 offer fields live; 4 campaigns with routing values; 4 industry offers
- [x] Serve: GN slug → `INDUSTRY:autobody` + prospect video empty (correct — none exists); White Sands → industry offer + own R2 video resolved
- [ ] Quiz/lead capture still tags the right prospect (`?prospect=` flow intact)
- [x] `tsc` clean (chi backend modulo pre-existing twenty-client errors; chi frontend; Express; cold-dialer)
- [x] Redeployed chi + `cold-dialer`; phi already live
- [ ] Spot-check live funnel + template + SMS draft links

### Phase 5 — Industry hero copy (2026-09-11, approved voice)
- [x] Titles (all rows): `We Built You a Website` (never mention the industry)
- [x] H1s: underlined + navy `website we made for you/shop/studio` + `below`
- [x] Ledes, punched up: bold effort + combined yellow mark `vertical (like yours)` + underlined `{{area}}` + bold video line + blue claim with bold `10+ more {jobs} a month`
- [x] Applied via `ui-kit/apps/web/scripts/style-industry-offers.ts` (bulk PATCH, idempotent); verified live in chi `by-prospect` payloads
- [ ] Eyeball one live funnel page per industry for styling/render check

### Phase 6 — Quiz intro from the offer (2026-09-11)
- Root cause: `Quiz.tsx` hardcoded intro JSX; `quizConfig` save path stored questions-only; hydrate ignored object shape.
- [x] `Quiz.tsx`: `introTitle?`/`introDesc?`/`area?` props; intro renders as resolved HTML via `resolveAreaTokens` (same pipeline as hero)
- [x] `PreviewPage.tsx`: pass intro from `quizConfig` (object shape; legacy array → defaults); `area` from `?area=` → prospect city (existing prospect fetch)
- [x] `OfferDetailPage.tsx`: hydrate object shape; save full `{introTitle, introDesc, questions}`
- [x] Seeded `quizConfig.intro` on 4 `INDUSTRY:{id}` rows; verified in live chi `by-prospect` payload
- [x] Chi redeployed; bundle verified live (`introTitle`, `utm_source`, `utmSwaps` present); `tsc -b` clean

### Phase 9 — Quiz logo carousel (2026-09-11)
- [x] `agencyOffers.mediaLogos` RAW_JSON (`[{src, alt}]`) via seed; backend POST/PATCH whitelist + `by-prospect` visual payload
- [x] Standalone `LogoCarousel` BELOW the quiz section (never inside Quiz): normal H1 "We've worked with", seamless auto-scroll marquee (pauses on hover, edge fade), navy-tinted art
- [x] `PreviewPage` parses offer logos once, renders carousel after consultation section; `OfferDetailPage` logo manager (add src+alt/delete, hydrates legacy)
- [x] Verified: row write/read, payload key present, live bundle carries carousel + player; test logo removed
- [x] Chi redeployed; `tsc -b` clean (backend: pre-existing twenty-client errors only)

### Phase 10 — Navy offer logos on R2 (2026-09-11)
- [x] `logos/`: only `autotrader.svg` had artwork (`#222B5E` + red `#b11212` → `#0D2A4C`); `dealerkit.svg` + `CityAuctionGroupLogoInverted.svg` are empty shells (no shapes) — skipped loudly, not uploaded
- [x] Script `ui-kit/apps/web/scripts/upload-offer-logos.ts`: recolor → R2 `logos/<name>-navy.svg` → merge-stamp `mediaLogos` (no dupes)
- [x] Live: `…/logos/autotrader-navy.svg` serves navy-only art; `INDUSTRY:autobody` payload carries it (alt `Autotrader`)
- [x] Empty `.svg` shells fixed via sibling PNGs: wrapped as base64-embedded SVG shells (`CityAuctionGroupLogoInverted-navy.svg`, `dealerkit-logo-top-navy.svg`), navy via carousel CSS filter at render; all 3 live in `INDUSTRY:autobody` payload (raster-embedded, not true vector — replace with real vector art when available)

### Phase 12 — Iframe gap + funnel brand header (2026-09-11)
- [x] ui-kit `OfferFunnelPage`: no more fixed 800px — hidden off-flow iframe + compact spinner until first `offer:height`; exact height + fade on ready; 10s fallback to scrollable 1200px frame
- [x] `agencyOffers.brandName`/`brandSub`/`brandLogoUrl` TEXT via seed; backend whitelist + payload; navy `Icon1` mark uploaded to R2
- [x] `PreviewPage`: brand block above H1 (logo left, name right, 6-word sub beneath), all offer-driven HTML
- [x] `OfferDetailPage` landing tab: Brand header card (RichEditors + logo URL) with save/hydrate
- [x] Seeded 4 rows (`ListeningKit` + per-vertical 6-word subs); verified payload + live chi bundle; chi redeployed; `tsc -b` clean (phi redeploy still pending for iframe fix)
- [x] `agencyOffers.carouselHeading` TEXT + `carouselDesc` RICH_TEXT via seed; backend POST/PATCH whitelist + `by-prospect` payload
- [x] Landing tab: RichEditors for heading + desc (same toolbar/tokens as hero) + per-logo link URL; save/hydrate round-trips
- [x] `LogoCarousel`: heading/desc from offer object (`{{area}}`-resolved, fallbacks when blank); logos optionally link out
- [x] Seeded all 4 rows (heading `We've worked with`; UK & Ireland automotive desc); verified payload + live bundle; chi redeployed; `tsc -b` clean
- [x] `agencyOffers.mediaLogos` RAW_JSON (`[{src, alt}]`) via seed; backend POST/PATCH whitelist + `by-prospect` visual payload
- [x] `Quiz mediaLogos?` prop: "We've worked with" + scroll-snap SVG row, navy tint via CSS filter (monochrome art best)
- [x] `PreviewPage` pass-through (array/`{logos}` shapes); `OfferDetailPage` logo manager (add src+alt/delete, hydrates legacy)
- [x] Verified: row write/read, payload key present, live bundle carries carousel; test logo removed
- [x] Chi redeployed; `tsc -b` clean (backend: pre-existing twenty-client errors only)
- [x] `agencyProspects.quizCurrency` TEXT (`currency` is reserved in Twenty); `inferProspectCurrency` in `lib/template-sites/prospects.ts` (country → phone-prefix → `$`); stamped in enrich flow + backfilled 741/741
- [x] Chi prospects allowlist gains `quizCurrency`; `PreviewPage` passes `currency`; `Quiz` resolves `{{currency}}` pre-area-resolver (+ question text)
- [x] Q1 per industry (`{{currency}}5000 worth of {repair/tint/detailing/trade} customers…`, DQ only `Wouldn't do anything`, fbLead on `Be so useful`); Q2 authority (`calls the shots`); Q3 intent (`build it out for you?`) — plain probe-talk, no market/census/MRR
- [x] `DEFAULT_QUESTIONS` replaced in both Quiz files; 4 industry sets seeded; chi redeployed; live bundle + payloads verified (GN: Q1 + DQ wiring + `€` via Waterford record)
- [x] `QualifierQuiz.tsx`: intro headline/desc inputs → `RichEditor` (area-token button on desc); same styling/tokens as hero
- [x] Chi `public.ts`: `by-prospect` payload gains `prospectCity`/`prospectRegion`
- [x] UTM was backend-only (stored, never authored/applied; README tab didn't exist): added `UTM swaps` tab in `OfferDetailPage` (StatusSelect field + RichEditor replacement + add/delete; hydrates legacy shapes; saves `{rules}` only when non-empty)
- [x] `PreviewPage.tsx`: `?utm_source=` first-match rule swaps one hero field per visit; base copy untouched on miss
- [x] Chi redeployed; bundle verified live; `tsc -b` clean
- `GENERAL_TRADES` has no template pack — `templateUrl` falls back to phi `/offer/general/...` shell (works, no redesign preview).
- Per-prospect offer rows stay readable in builder but unserved; revisit deletion only after 30 days of industry-only serving.
- Node01 Express rollout needed for main-tree backend changes (Railcode `cold-dialer` covers the live surface).
