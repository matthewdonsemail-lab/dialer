# Contact dialer: live Twenty introspection (2026-10-10)

Output of `node scripts/introspect-twenty-messaging.mjs` against `https://twenty.inferencesaver.com`, run before any schema change, as `CONTACT_DIALER_HANDOFF.md` §6.1 requires. Re-run the script to refresh it.

## What this means for the plan

| Plan item | Live state | Decision |
|---|---|---|
| `agencyConversation` / `agencyMessage` (§5.1-5.2) | **Both already exist**, created for the Blaster SMS tool. Field names differ from the plan: `pairKey` instead of `threadKey`, `peerPhone` instead of `remoteNumber`, `latestMessageAt`/`latestPreview`/`latestDirection` instead of `lastMessage*`, `telnyxMessageId` instead of `externalId`. `status` and `direction` are TEXT, not SELECT. There is **no message → conversation relation**, and `agencyProspect.messages` / `agencyLead.messages` are MANY_TO_ONE to a single message, which is inverted | Do not create duplicates (§9). Changing these objects affects Blaster, so the Phase 2 schema approach needs a decision first |
| `agencyCall.status` (bug #7) | SELECT with only `IN_PROGRESS, COMPLETED, FAILED, NO_ANSWER, BUSY`, while `lib/call-outcome.ts` writes `INTERESTED`, `VOICEMAIL`, `DNC`, ... | Confirmed. Fix in Phase 1 with the separate `disposition` field (§5.3), keeping `status` as the system result |
| `agencyCall.notes`, `agencyCall.disposition` (§5.3) | Missing | Add in Phase 1 |
| `agencyProspect.notes` (§5.4, bug #3) | Missing (no `note` either) | **Added in Phase 0** as a nullable TEXT field by `setupProspectSchema()` (`backend/src/lib/twenty/agencyProspect`) |
| `agencyProspect.qualificationStatus` (bug #9) | Present, SELECT `QUALIFIED, DISQUALIFIED` | Mapped in Phase 0 |
| `agencyLead.note` | Present (TEXT) | Lead notes already map correctly |

## Raw output (before Phase 0 added `agencyProspect.notes`)

```text
Twenty workspace: https://twenty.inferencesaver.com  (69 objects)

== agencyConversation / agencyConversations  (workspace, 24 fields)
   attachments                  RELATION ONE_TO_MANY -> attachment.target
   blasterConversationId        TEXT
   blasterNumber                TEXT
   createdByMemberId            TEXT
   latestDirection              TEXT
   latestMessageAt              DATE_TIME
   latestMessageId              TEXT
   latestPreview                TEXT
   messageCount                 NUMBER
   name                         TEXT
   noteTargets                  RELATION ONE_TO_MANY -> noteTarget.target
   pairKey                      TEXT
   peerPhone                    TEXT
   status                       TEXT
   taskTargets                  RELATION ONE_TO_MANY -> taskTarget.target
   timelineActivities           RELATION ONE_TO_MANY -> timelineActivity.target

== agencyMessage / agencyMessages  (workspace, 21 fields)
   agencyLead                   RELATION ONE_TO_MANY -> agencyLead.messages
   agencyProspect               RELATION ONE_TO_MANY -> agencyProspect.messages
   attachments                  RELATION ONE_TO_MANY -> attachment.target
   body                         TEXT
   direction                    TEXT
   fromNumber                   TEXT
   name                         TEXT
   noteTargets                  RELATION ONE_TO_MANY -> noteTarget.target
   status                       TEXT
   taskTargets                  RELATION ONE_TO_MANY -> taskTarget.target
   telnyxMessageId              TEXT
   timelineActivities           RELATION ONE_TO_MANY -> timelineActivity.target
   toNumber                     TEXT

== agencyCall / agencyCalls  (workspace, 44 fields)
   agencyLead                   RELATION MANY_TO_ONE -> agencyLead.calls
   agencyPhone                  RELATION MANY_TO_ONE -> agencyPhone.calls
   agencyProspect               RELATION MANY_TO_ONE -> agencyProspect.calls
   aiAnalyzedAt                 DATE_TIME
   aiConfidence                 NUMBER
   aiKeyPoints                  TEXT
   aiModel                      TEXT
   aiScore                      NUMBER
   aiScores                     TEXT
   aiSentiment                  TEXT
   aiSummary                    TEXT
   attachments                  RELATION ONE_TO_MANY -> attachment.target
   createdByMemberId            TEXT
   debugLog                     TEXT
   direction                    SELECT [INBOUND, OUTBOUND, MISSED]
   durationSeconds              NUMBER
   endedAt                      DATE_TIME
   fromNumber                   TEXT
   meetingAt                    DATE_TIME
   meetingBookingId             TEXT
   meetingProvider              SELECT [NONE, GOOGLE_MEET, ZOOM, TEAMS, OTHER]
   meetingStatus                SELECT [NONE, SCHEDULED, HELD, CANCELLED, NO_SHOW]
   meetingUrl                   TEXT
   name                         TEXT
   noteTargets                  RELATION ONE_TO_MANY -> noteTarget.target
   recordingUrl                 TEXT
   startedAt                    DATE_TIME
   status                       SELECT [IN_PROGRESS, COMPLETED, FAILED, NO_ANSWER, BUSY]
   summary                      TEXT
   taskTargets                  RELATION ONE_TO_MANY -> taskTarget.target
   telnyxCallId                 TEXT
   telnyxRecordingId            TEXT
   timelineActivities           RELATION ONE_TO_MANY -> timelineActivity.target
   toNumber                     TEXT
   transcript                   TEXT
   transcriptionStatus          SELECT [NONE, PENDING, READY, FAILED]

== agencyProspect / agencyProspects  (workspace, 79 fields)
   agencyLeads                  RELATION ONE_TO_MANY -> agencyLead.agencyProspect
   aiFitScore                   NUMBER
   attachments                  RELATION ONE_TO_MANY -> attachment.target
   brandColors                  RAW_JSON
   calls                        RELATION ONE_TO_MANY -> agencyCall.agencyProspect
   campaignId                   RELATION MANY_TO_ONE -> agencyCampaign.prospects
   city                         TEXT
   coldCallStatus               SELECT [NEW, CONTACTED, INTERESTED, NOT_INTERESTED, CALLBACK, CONVERTED, DO_NOT_CONTACT]
   confidence2                  TEXT
   confidence3                  TEXT
   country                      TEXT
   createdByMemberId            TEXT
   email                        TEXT
   email2                       TEXT
   email3                       TEXT
   emailConfidence              TEXT
   enrichmentError              TEXT
   enrichmentStatus             SELECT [QUEUED, ENRICHING, ENRICHED, FAILED]
   externalId                   TEXT
   facebookUrl                  TEXT
   fitReason                    TEXT
   foundedYear                  NUMBER
   fullAddress                  TEXT
   ghlWebhookUrl                TEXT
   googleBusinessUrl            TEXT
   googleBusinessUrlPrimary     LINKS
   googleCid                    TEXT
   googlePlaceId                TEXT
   googleReviewsUrl             TEXT
   label                        SELECT [AUTO_PAINT_AND_BODY_SHOPS, WINDOW_TINTING, AUTO_DETAILING, GENERAL_TRADES, NURSERY_SCHOOL]
   lat                          NUMBER
   lng                          NUMBER
   logoUrl                      TEXT
   messages                     RELATION MANY_TO_ONE -> agencyMessage.agencyProspect
   name                         TEXT
   niche                        TEXT
   noteTargets                  RELATION ONE_TO_MANY -> noteTarget.target
   outboundLabel                SELECT [NEEDS_ENRICHMENT, NEEDS_VIDEO, READY_FOR_SMS, SMS_IN_PROGRESS, FOLLOW_UP_DUE, HUMAN_REVIEW, POSITIVE_REPLY, NEGATIVE_REPLY, DO_NOT_CONTACT, DELIVERY_FAILED]
   outboundState                SELECT [NEW, ENRICHED, VIDEO_READY, QUEUED, SENDING, AWAITING_DELIVERY, AWAITING_REPLY, REPLIED, QUALIFIED, BOOKED, COMPLETED, PAUSED, OPTED_OUT, FAILED]
   people                       RELATION ONE_TO_MANY -> agencyPerson.prospect
   phone                        TEXT
   phoneNumber                  PHONES
   phoneValid                   BOOLEAN
   primaryEmail                 EMAILS
   primaryPhone                 PHONES
   qualificationStatus          SELECT [QUALIFIED, DISQUALIFIED]
   quizCurrency                 TEXT
   rating                       NUMBER
   recentSignal                 TEXT
   region                       TEXT
   reviewCount                  NUMBER
   reviews                      RAW_JSON
   serviceArea                  RAW_JSON
   slug                         TEXT
   smsMetadata                  RAW_JSON
   taskTargets                  RELATION ONE_TO_MANY -> taskTarget.target
   techStack                    TEXT
   timelineActivities           RELATION ONE_TO_MANY -> timelineActivity.target
   turnaround                   TEXT
   utmSource                    SELECT [OUTBOUND, INBOUND, BLENDED]
   videoError                   TEXT
   videoSource                  TEXT
   videoStatus                  SELECT [NONE, QUEUED, RECORDING, RENDERED, ATTACHED, FAILED]
   videoUrl                     LINKS
   website                      TEXT
   websiteUrl                   TEXT
   websiteUrlPrimary            LINKS
   whatsappStatus               SELECT [PENDING, VALIDATED, REJECTED]
   whatsappValidated            BOOLEAN
   yearsInBusiness              TEXT
   yelpUrl                      TEXT

== agencyLead / agencyLeads  (workspace, 29 fields)
   agencyOpportunities          RELATION ONE_TO_MANY -> agencyOpportunity.agencyLead
   agencyProspect               RELATION MANY_TO_ONE -> agencyProspect.agencyLeads
   attachments                  RELATION ONE_TO_MANY -> attachment.target
   calls                        RELATION ONE_TO_MANY -> agencyCall.agencyLead
   campaignId                   RELATION MANY_TO_ONE -> agencyCampaign.leads
   coldCallStatus               SELECT [NEW, CONTACTED, INTERESTED, NOT_INTERESTED, CALLBACK, CONVERTED, DO_NOT_CONTACT]
   contactName                  TEXT
   email                        EMAILS
   messages                     RELATION MANY_TO_ONE -> agencyMessage.agencyLead
   name                         TEXT
   note                         TEXT
   noteTargets                  RELATION ONE_TO_MANY -> noteTarget.target
   outboundMessage              TEXT
   person                       RELATION MANY_TO_ONE -> agencyPerson.leads
   phone                        PHONES
   qualificationStatus          SELECT [QUALIFIED, DISQUALIFIED]
   replyAt                      DATE_TIME
   source                       TEXT
   status                       SELECT [NEW, CONTACTED, QUALIFIED, BOOKED, CONVERTED, LOST]
   taskTargets                  RELATION ONE_TO_MANY -> taskTarget.target
   timelineActivities           RELATION ONE_TO_MANY -> timelineActivity.target

== agencyPhone / agencyPhones  (workspace, 31 fields)
   attachments                  RELATION ONE_TO_MANY -> attachment.target
   calls                        RELATION ONE_TO_MANY -> agencyCall.agencyPhone
   callState                    SELECT [IDLE, DIALING, ACTIVE]
   claimedAt                    DATE_TIME
   claimedByEmail               TEXT
   claimedByMemberId            TEXT
   countryCode                  TEXT
   currentCallId                TEXT
   eligibleProducts             RAW_JSON
   features                     RAW_JSON
   health                       RAW_JSON
   lastHeartbeatAt              DATE_TIME
   lastSyncedAt                 TEXT
   messagingProfileId           TEXT
   name                         TEXT
   noteTargets                  RELATION ONE_TO_MANY -> noteTarget.target
   numberType                   SELECT [LONG_CODE, TOLL_FREE, SHORT_CODE]
   phoneNumber                  TEXT
   state                        SELECT [ACTIVE, PAUSED, DEGRADED, RETIRED]
   taskTargets                  RELATION ONE_TO_MANY -> taskTarget.target
   tenDlcCampaignId             TEXT
   timelineActivities           RELATION ONE_TO_MANY -> timelineActivity.target
   tollFreeVerificationId       TEXT

== Plan checks
   agencyProspect.notes               missing  - free-text prospect notes (plan §5.4)
   agencyProspect.note                missing  - existing note field, if any
   agencyProspect.qualificationStatus present  SELECT [QUALIFIED, DISQUALIFIED]  - qualification (bug #9)
   agencyCall.notes                   missing  - call notes (plan §5.3)
   agencyCall.disposition             missing  - user outcome (plan §5.3)
   agencyCall.status                  present  SELECT [IN_PROGRESS, COMPLETED, FAILED, NO_ANSWER, BUSY]  - system result (bug #7)
```
