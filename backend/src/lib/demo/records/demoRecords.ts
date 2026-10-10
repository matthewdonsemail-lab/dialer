/*
 * The demo workspace: a small, fictional agency calling local businesses.
 * Every record is in the shape Twenty stores it, so the same data seeds a
 * fresh workspace (seed/seedDemo.ts) and feeds the screenshot capture
 * (scripts/screenshots), which maps it through the real route helpers.
 *
 * Nothing here is real. Phone numbers are in the 555-01xx range reserved for
 * fiction, e-mail and web addresses use the .example domain, and ids are
 * fixed so seeding twice updates rather than duplicates.
 */

/** A fixed, valid UUID per record: group 1-9, n 1-999. Pure. */
export function demoId(group: number, n: number): string {
  return `de000000-0000-4000-a000-${String(group * 1000 + n).padStart(12, "0")}`;
}

export const DEMO_MEMBERS = [
  { id: demoId(1, 1), name: "Alex Rivera", email: "alex@agency.example" },
  { id: demoId(1, 2), name: "Sam Chen", email: "sam@agency.example" },
  { id: demoId(1, 3), name: "Jordan Patel", email: "jordan@agency.example" },
  { id: demoId(1, 4), name: "Taylor Brooks", email: "taylor@agency.example" },
] as const;

/** The signed-in member in the screenshots. */
export const DEMO_USER = DEMO_MEMBERS[0];

type Member = (typeof DEMO_MEMBERS)[number];

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function phoneComposite(e164: string) {
  const calling = e164.startsWith("+1") ? "+1" : e164.startsWith("+44") ? "+44" : e164.startsWith("+353") ? "+353" : "+1";
  const country = calling === "+44" ? "GB" : calling === "+353" ? "IE" : "US";
  return {
    primaryPhoneNumber: e164.slice(calling.length),
    primaryPhoneCountryCode: country,
    primaryPhoneCallingCode: calling,
    additionalPhones: [],
  };
}

function actor(m: Member) {
  return { source: "MANUAL", workspaceMemberId: m.id, name: m.name, context: null };
}

function note(at: Date, author: Member, body: string): string {
  return `--- ${at.toISOString()} | ${author.name}\n${body}`;
}

const CAMPAIGNS = [
  { n: 1, name: "Window Tinting - Texas", campaignType: "COLD_CALL", status: "ACTIVE", utmSource: "OUTBOUND", industryId: "WINDOW_TINTING", urlKey: "window-tinting" },
  { n: 2, name: "Auto Detailing - Colorado", campaignType: "COLD_CALL", status: "ACTIVE", utmSource: "OUTBOUND", industryId: "AUTO_DETAILING", urlKey: "auto-detailing" },
  { n: 3, name: "Nurseries - Pacific Northwest", campaignType: "OUTBOUND", status: "DRAFT", utmSource: "BLENDED", industryId: "NURSERY_SCHOOL", urlKey: "nursery-school" },
];

/** [name, city, region, country, niche, label, phone, rating, reviews, status, campaign] */
type ProspectRow = [string, string, string, string, string, string, string, number, number, string, number];

const PROSPECTS: ProspectRow[] = [
  ["Clearview Window Tint", "Austin", "TX", "US", "Window Tinting", "WINDOW_TINTING", "+15125550123", 4.8, 212, "INTERESTED", 1],
  ["Lone Star Tint Co", "Austin", "TX", "US", "Window Tinting", "WINDOW_TINTING", "+15125550131", 4.6, 98, "CALLBACK", 1],
  ["Shade Masters", "Round Rock", "TX", "US", "Window Tinting", "WINDOW_TINTING", "+15125550137", 4.9, 341, "CONTACTED", 1],
  ["Hill Country Films", "San Marcos", "TX", "US", "Window Tinting", "WINDOW_TINTING", "+15125550144", 4.4, 57, "NEW", 1],
  ["Capitol Auto Glass & Tint", "Austin", "TX", "US", "Window Tinting", "WINDOW_TINTING", "+15125550152", 4.7, 176, "NOT_INTERESTED", 1],
  ["Bluebonnet Tint Studio", "Georgetown", "TX", "US", "Window Tinting", "WINDOW_TINTING", "+15125550158", 5.0, 44, "NEW", 1],
  ["Pflugerville Tint Works", "Pflugerville", "TX", "US", "Window Tinting", "WINDOW_TINTING", "+15125550163", 4.5, 121, "CONVERTED", 1],
  ["Riverside Ceramic Tint", "Austin", "TX", "US", "Window Tinting", "WINDOW_TINTING", "+15125550169", 4.3, 39, "NEW", 1],
  ["Mile High Detailing", "Denver", "CO", "US", "Auto Detailing", "AUTO_DETAILING", "+13035550112", 4.9, 287, "INTERESTED", 2],
  ["Front Range Shine", "Boulder", "CO", "US", "Auto Detailing", "AUTO_DETAILING", "+13035550118", 4.7, 132, "CONTACTED", 2],
  ["Peak Performance Auto Spa", "Aurora", "CO", "US", "Auto Detailing", "AUTO_DETAILING", "+13035550125", 4.6, 75, "CALLBACK", 2],
  ["Red Rocks Ceramic Coating", "Lakewood", "CO", "US", "Auto Detailing", "AUTO_DETAILING", "+13035550133", 4.8, 164, "NEW", 2],
  ["Cherry Creek Detail Co", "Denver", "CO", "US", "Auto Detailing", "AUTO_DETAILING", "+13035550139", 4.2, 31, "DO_NOT_CONTACT", 2],
  ["Summit Mobile Detailing", "Littleton", "CO", "US", "Auto Detailing", "AUTO_DETAILING", "+13035550146", 4.9, 58, "NEW", 2],
  ["Rose City Little Learners", "Portland", "OR", "US", "Nursery School", "NURSERY_SCHOOL", "+15035550114", 4.9, 66, "NEW", 3],
  ["Cascade Kids Nursery", "Beaverton", "OR", "US", "Nursery School", "NURSERY_SCHOOL", "+15035550121", 4.7, 48, "CONTACTED", 3],
  ["Puget Sound Preschool", "Tacoma", "WA", "US", "Nursery School", "NURSERY_SCHOOL", "+12535550127", 4.8, 92, "INTERESTED", 3],
  ["Harbour Body Repairs", "Vancouver", "BC", "CA", "Auto Body", "AUTO_PAINT_AND_BODY_SHOPS", "+16045550135", 4.5, 210, "NEW", 2],
  ["Maple Leaf Collision", "Toronto", "ON", "CA", "Auto Body", "AUTO_PAINT_AND_BODY_SHOPS", "+14165550141", 4.4, 133, "CALLBACK", 2],
  ["Liffey Motor Works", "Dublin", "Dublin", "IE", "Auto Body", "AUTO_PAINT_AND_BODY_SHOPS", "+35315550148", 4.6, 87, "NEW", 2],
  ["Thames Valley Builders", "Reading", "Berkshire", "GB", "General contractor", "GENERAL_TRADES", "+441185550156", 4.3, 64, "CONTACTED", 3],
  ["Gulf Coast Tint Pros", "Houston", "TX", "US", "Window Tinting", "WINDOW_TINTING", "+17135550161", 4.6, 154, "NEW", 1],
  ["Alamo Window Film", "San Antonio", "TX", "US", "Window Tinting", "WINDOW_TINTING", "+12105550166", 4.7, 102, "CONTACTED", 1],
  ["Bayou City Detailing", "Houston", "TX", "US", "Auto Detailing", "AUTO_DETAILING", "+17135550172", 4.8, 119, "NEW", 2],
];

const OUTBOUND_BY_STATUS: Record<string, string> = {
  NEW: "NEEDS_VIDEO",
  CONTACTED: "READY_FOR_SMS",
  INTERESTED: "READY_FOR_SMS",
  CALLBACK: "FOLLOW_UP_DUE",
  NOT_INTERESTED: "NEGATIVE_REPLY",
  CONVERTED: "POSITIVE_REPLY",
  DO_NOT_CONTACT: "DO_NOT_CONTACT",
};

const FEATURED_TRANSCRIPT = [
  "Alex: Hi, is this Maria? It's Alex from the agency, I was looking at Clearview's reviews this morning.",
  "Maria: Yes, this is Maria. Two hundred reviews and counting, we're proud of that.",
  "Alex: You should be. I noticed most of them mention ceramic tint, but your website doesn't show prices or let people book.",
  "Maria: That's fair. People call us to ask the same three questions all day.",
  "Alex: We built a one-page site for tint shops that answers those, shows your reviews and takes bookings. I can text you a preview of it with your name on it.",
  "Maria: Sure, send it over. If it books appointments I'm interested.",
  "Alex: Great. I'll text it now and call you Thursday at ten to walk through it.",
  "Maria: Thursday works. Talk then.",
].join("\n");

export interface DemoRecords {
  members: typeof DEMO_MEMBERS;
  agencyCampaigns: any[];
  agencyScripts: any[];
  agencyPhones: any[];
  agencyProspects: any[];
  agencyLeads: any[];
  agencyPeople: any[];
  agencyCalls: any[];
  agencyCallCampaigns: any[];
}

/** The whole demo workspace, with times relative to `now`. Pure. */
export function buildDemoRecords(now: Date = new Date()): DemoRecords {
  const t = (msAgo: number) => new Date(now.getTime() - msAgo).toISOString();
  const [alex, sam, jordan, taylor] = DEMO_MEMBERS;
  const team: Member[] = [alex, sam, jordan, taylor];

  const agencyCampaigns = CAMPAIGNS.map((c) => ({
    id: demoId(2, c.n),
    name: c.name,
    status: c.status,
    campaignType: c.campaignType,
    utmSource: c.utmSource,
    industryId: c.industryId,
    urlKey: c.urlKey,
    note: JSON.stringify({ dailyGoal: 60, callWindow: "09:00-17:00" }),
    createdAt: t(30 * DAY),
    updatedAt: t(2 * DAY),
  }));

  const agencyScripts = [
    {
      id: demoId(3, 1),
      name: "Window tint opener",
      campaignIdId: demoId(2, 1),
      scriptData: JSON.stringify({
        category: "cold_call",
        content: [
          "Hi, is this {{first_name}}? It's {{agent}} from the agency.",
          "I was reading {{company}}'s reviews this morning: {{review_count}} of them, mostly about ceramic tint.",
          "Your site doesn't show prices or take bookings, so customers call to ask. We built a one-page site for tint shops that does both.",
          "Can I text you a preview with your shop's name on it?",
        ].join("\n\n"),
        objection_responses: {
          "We already have a website": { category: "website", response: "Most shops do. This one is built to book appointments, and you can keep your current site." },
          "We get enough from referrals": { category: "demand", response: "Referrals are the best leads. This page gives them somewhere to book when they look you up." },
          "It's too expensive": { category: "price", response: "The preview is free, and you only pay once it is booking jobs." },
          "Just tell me what you do": { category: "clarity", response: "We send you a page with your reviews and prices that takes bookings by text." },
        },
      }),
      createdAt: t(20 * DAY),
      updatedAt: t(3 * DAY),
    },
    {
      id: demoId(3, 2),
      name: "Detailing follow-up",
      campaignIdId: demoId(2, 2),
      scriptData: JSON.stringify({
        category: "follow_up",
        content: [
          "Hi {{first_name}}, it's {{agent}} again. Did you get a chance to open the page I texted?",
          "Most detailers we work with get their first booking from it in the first week.",
          "Would Tuesday or Wednesday suit for a ten-minute walk-through?",
        ].join("\n\n"),
        objection_responses: {
          "I didn't see the text": { category: "follow_up", response: "No problem, I'll resend it now while we're on the phone." },
          "I'm too busy right now": { category: "timing", response: "Understood. When's a quieter time this week? I'll call back then." },
        },
      }),
      createdAt: t(12 * DAY),
      updatedAt: t(1 * DAY),
    },
  ];

  const agencyPhones = [
    { id: demoId(4, 1), name: "Austin main line", phoneNumber: "+15125550100", countryCode: "US", numberType: "LONG_CODE", state: "ACTIVE", callState: "IDLE", messagingProfileId: "demo-profile", lastSyncedAt: t(2 * HOUR), createdAt: t(40 * DAY), updatedAt: t(2 * HOUR) },
    { id: demoId(4, 2), name: "Denver line", phoneNumber: "+13035550100", countryCode: "US", numberType: "LONG_CODE", state: "ACTIVE", callState: "ACTIVE", claimedByMemberId: sam.id, claimedByEmail: sam.email, claimedAt: t(3 * MINUTE), lastHeartbeatAt: t(2_000), messagingProfileId: "demo-profile", lastSyncedAt: t(2 * HOUR), createdAt: t(40 * DAY), updatedAt: t(3 * MINUTE) },
    { id: demoId(4, 3), name: "Portland line", phoneNumber: "+15035550100", countryCode: "US", numberType: "LONG_CODE", state: "PAUSED", callState: "IDLE", messagingProfileId: "demo-profile", lastSyncedAt: t(1 * DAY), createdAt: t(40 * DAY), updatedAt: t(1 * DAY) },
    { id: demoId(4, 4), name: "Toll-free", phoneNumber: "+18885550100", countryCode: "US", numberType: "TOLL_FREE", state: "ACTIVE", callState: "IDLE", messagingProfileId: "demo-profile", lastSyncedAt: t(2 * HOUR), createdAt: t(40 * DAY), updatedAt: t(2 * HOUR) },
  ];

  const agencyProspects = PROSPECTS.map(([name, city, region, country, niche, label, phone, rating, reviewCount, status, campaign], i) => {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const owner = team[i % team.length];
    return {
      id: demoId(5, i + 1),
      name,
      slug,
      phone,
      phoneNumber: phoneComposite(phone),
      primaryPhone: phoneComposite(phone),
      phoneValid: true,
      fullAddress: `${100 + i * 17} Main Street, ${city}, ${region}`,
      city,
      region,
      country,
      niche,
      label,
      website: `https://${slug}.example`,
      email: `hello@${slug}.example`,
      rating,
      reviewCount,
      coldCallStatus: status,
      outboundLabel: OUTBOUND_BY_STATUS[status] ?? "NEEDS_ENRICHMENT",
      outboundState: status === "NEW" ? "ENRICHED" : "AWAITING_REPLY",
      videoStatus: i % 3 === 0 ? "ATTACHED" : i % 3 === 1 ? "RENDERED" : "QUEUED",
      utmSource: "OUTBOUND",
      googleReviewsUrl: `https://maps.example/${slug}`,
      campaignIdId: demoId(2, campaign),
      createdByMemberId: owner.id,
      notes: i === 0
        ? [
            note(new Date(now.getTime() - 26 * HOUR), alex, "Owner is Maria. Busy before 10am, best to call late morning."),
            note(new Date(now.getTime() - 40 * MINUTE), alex, "Interested in the booking page. Sent the preview by text, follow-up call booked for Thursday 10:00."),
          ].join("\n\n")
        : null,
      createdAt: t((20 - (i % 15)) * DAY),
      updatedAt: t((i % 5) * HOUR + 30 * MINUTE),
    };
  });

  const agencyLeads = [
    { id: demoId(6, 1), name: "Priya Nair", contactName: "Priya Nair", company: "Pflugerville Tint Works", phone: phoneComposite("+15125550163"), email: { primaryEmail: "priya@pflugerville-tint-works.example", additionalEmails: [] }, coldCallStatus: "CONVERTED", source: "cold_call", note: "Booked a launch call for next week.", createdById: alex.id, campaignIdId: demoId(2, 1), createdAt: t(4 * DAY), updatedAt: t(1 * DAY) },
    { id: demoId(6, 2), name: "Marcus Webb", contactName: "Marcus Webb", company: "Mile High Detailing", phone: phoneComposite("+13035550112"), email: { primaryEmail: "marcus@mile-high-detailing.example", additionalEmails: [] }, coldCallStatus: "INTERESTED", source: "cold_call", note: "Wants pricing for two locations.", createdById: sam.id, campaignIdId: demoId(2, 2), createdAt: t(2 * DAY), updatedAt: t(5 * HOUR) },
    { id: demoId(6, 3), name: "Hannah Okafor", contactName: "Hannah Okafor", company: "Puget Sound Preschool", phone: phoneComposite("+12535550127"), email: { primaryEmail: "hannah@puget-sound-preschool.example", additionalEmails: [] }, coldCallStatus: "CALLBACK", source: "website", note: "Call back after the open day.", createdById: jordan.id, campaignIdId: demoId(2, 3), createdAt: t(1 * DAY), updatedAt: t(3 * HOUR) },
  ];

  const featured = agencyProspects[0];
  const agencyPeople = [
    { id: demoId(7, 1), name: "Maria Lopez", jobTitle: "Owner", personRole: "Decision maker", city: "Austin", phones: phoneComposite("+15125550124"), emails: { primaryEmail: "maria@clearview-window-tint.example", additionalEmails: [] }, linkedinLink: { primaryLinkUrl: "https://linkedin.example/in/maria-lopez" }, prospectId: featured.id, createdAt: t(26 * HOUR) },
    { id: demoId(7, 2), name: "Dev Shah", jobTitle: "Shop manager", personRole: "Gatekeeper", city: "Austin", phones: phoneComposite("+15125550125"), emails: { primaryEmail: "dev@clearview-window-tint.example", additionalEmails: [] }, linkedinLink: null, prospectId: featured.id, createdAt: t(26 * HOUR) },
  ];

  // Calls: the featured conversation first, then a spread over two weeks.
  const DISPOSITIONS = ["INTERESTED", "NO_ANSWER", "VOICEMAIL", "CALLBACK", "NOT_INTERESTED", "NO_ANSWER", "GOOD_NUMBER", "APPOINTMENT_SET", "VOICEMAIL", "BAD_NUMBER", "NO_ANSWER", "CALLBACK"];
  const SUMMARIES: Record<string, string> = {
    INTERESTED: "The owner liked the booking page idea and asked for a preview by text.",
    CALLBACK: "Reached the front desk; the owner asked for a call back later this week.",
    NOT_INTERESTED: "Happy with their current agency and declined a preview.",
    APPOINTMENT_SET: "Booked a ten-minute walk-through of the page for Tuesday.",
    GOOD_NUMBER: "Confirmed this is the owner's direct line; no decision yet.",
  };
  const agencyCalls: any[] = [
    {
      id: demoId(8, 1),
      name: "Outbound call to Clearview Window Tint",
      direction: "OUTBOUND",
      status: "COMPLETED",
      disposition: "APPOINTMENT_SET",
      notes: "Maria wants the booking page. Preview texted, follow-up Thursday 10:00.",
      fromNumber: "+15125550100",
      toNumber: featured.phone,
      startedAt: t(45 * MINUTE),
      endedAt: t(45 * MINUTE - 222_000),
      durationSeconds: 222,
      telnyxCallId: "v3:demo-call-control-id",
      telnyxRecordingId: "demo-recording",
      transcript: FEATURED_TRANSCRIPT,
      transcriptionStatus: "READY",
      summary: "Maria, the owner, wants a booking page for Clearview. A preview was texted and a follow-up call is set for Thursday at 10:00.",
      aiSummary: "Maria, the owner, wants a booking page for Clearview. A preview was texted and a follow-up call is set for Thursday at 10:00.",
      aiSentiment: "POSITIVE",
      aiScore: 88,
      aiKeyPoints: JSON.stringify([
        "Opened with a specific observation about the shop's 212 reviews.",
        "Named the gap: no prices or booking on the current website.",
        "Owner confirmed customers call with the same three questions all day.",
        "Agreed next step: preview by text and a call on Thursday at 10:00.",
      ]),
      aiScores: JSON.stringify({ conversion: 5, politeness: 5, questioning: 4, engagement: 5, sentiment: 4 }),
      aiConfidence: 0.92,
      aiModel: "gpt-4o-mini",
      aiAnalyzedAt: t(40 * MINUTE),
      debugLog: "invite sent\n100 Trying\n180 Ringing\n200 OK (call control id captured)\nrecording started\nBYE sent by agent",
      meetingUrl: "https://meet.example/clearview-walkthrough",
      meetingProvider: "GOOGLE_MEET",
      meetingStatus: "SCHEDULED",
      meetingAt: new Date(now.getTime() + 2 * DAY).toISOString(),
      agencyPhoneId: demoId(4, 1),
      agencyProspectId: featured.id,
      createdByMemberId: alex.id,
      createdBy: actor(alex),
      createdAt: t(45 * MINUTE),
      updatedAt: t(40 * MINUTE),
    },
    {
      id: demoId(8, 2),
      name: "Outbound call to Clearview Window Tint",
      direction: "OUTBOUND",
      status: "NO_ANSWER",
      disposition: "VOICEMAIL",
      fromNumber: "+15125550100",
      toNumber: featured.phone,
      startedAt: t(26 * HOUR),
      endedAt: t(26 * HOUR - 31_000),
      durationSeconds: 31,
      transcriptionStatus: "NONE",
      agencyPhoneId: demoId(4, 1),
      agencyProspectId: featured.id,
      createdByMemberId: alex.id,
      createdBy: actor(alex),
      createdAt: t(26 * HOUR),
      updatedAt: t(26 * HOUR),
    },
  ];
  for (let i = 0; i < 46; i++) {
    const p = agencyProspects[1 + (i * 7) % (agencyProspects.length - 1)];
    const m = team[i % team.length];
    const disposition = DISPOSITIONS[i % DISPOSITIONS.length];
    const answered = !["NO_ANSWER", "VOICEMAIL", "BAD_NUMBER"].includes(disposition);
    const duration = answered ? 60 + ((i * 53) % 300) : disposition === "VOICEMAIL" ? 25 + (i % 20) : 0;
    const ago = 2 * HOUR + i * 7 * HOUR + (i % 3) * 13 * MINUTE;
    const phone = p.region === "CO" ? demoId(4, 2) : p.region === "OR" || p.region === "WA" ? demoId(4, 3) : demoId(4, 1);
    const from = agencyPhones.find((x) => x.id === phone)!.phoneNumber;
    // The AI score follows the outcome: a refusal never rates as a great call.
    const SCORE_BASE: Record<string, number> = { APPOINTMENT_SET: 78, INTERESTED: 70, GOOD_NUMBER: 55, CALLBACK: 45, NOT_INTERESTED: 18 };
    const score = answered ? (SCORE_BASE[disposition] ?? 50) + ((i * 37) % 18) : null;
    agencyCalls.push({
      id: demoId(8, 3 + i),
      name: `Outbound call to ${p.name}`,
      direction: i % 11 === 5 ? "INBOUND" : "OUTBOUND",
      status: answered ? "COMPLETED" : disposition === "BAD_NUMBER" ? "FAILED" : "NO_ANSWER",
      disposition,
      fromNumber: from,
      toNumber: p.phone,
      startedAt: t(ago),
      endedAt: t(ago - duration * 1000),
      durationSeconds: duration,
      telnyxRecordingId: answered ? `demo-recording-${i}` : null,
      transcriptionStatus: answered ? "READY" : "NONE",
      summary: SUMMARIES[disposition] ?? null,
      aiSummary: SUMMARIES[disposition] ?? null,
      aiSentiment: answered ? (disposition === "NOT_INTERESTED" ? "NEGATIVE" : disposition === "CALLBACK" ? "NEUTRAL" : "POSITIVE") : null,
      aiScore: score,
      aiKeyPoints: answered ? JSON.stringify(["Reached the business during opening hours.", SUMMARIES[disposition] ?? "Conversation logged."]) : null,
      aiScores: answered ? JSON.stringify({ conversion: 2 + (i % 4), politeness: 4 + (i % 2), questioning: 2 + (i % 3), engagement: 3 + (i % 3), sentiment: 2 + (i % 4) }) : null,
      aiConfidence: answered ? 0.8 : null,
      aiModel: answered ? "gpt-4o-mini" : null,
      aiAnalyzedAt: answered ? t(ago - 5 * MINUTE) : null,
      agencyPhoneId: phone,
      agencyProspectId: p.id,
      createdByMemberId: m.id,
      createdBy: actor(m),
      createdAt: t(ago),
      updatedAt: t(ago - 5 * MINUTE),
    });
  }

  const agencyCallCampaigns = [
    { id: demoId(9, 1), name: "Austin tint shops - morning block", status: "ACTIVE", contactIds: JSON.stringify(agencyProspects.filter((p) => p.region === "TX").slice(0, 9).map((p) => p.id)), createdByMemberId: alex.id, ownerName: alex.name, createdAt: t(1 * DAY) },
    { id: demoId(9, 2), name: "Denver detailers", status: "ACTIVE", contactIds: JSON.stringify(agencyProspects.filter((p) => p.region === "CO").map((p) => p.id)), createdByMemberId: sam.id, ownerName: sam.name, createdAt: t(3 * DAY) },
    { id: demoId(9, 3), name: "Nursery intro calls", status: "COMPLETED", contactIds: JSON.stringify(agencyProspects.filter((p) => p.region === "OR" || p.region === "WA").map((p) => p.id)), createdByMemberId: jordan.id, ownerName: jordan.name, createdAt: t(9 * DAY) },
  ];

  return { members: DEMO_MEMBERS, agencyCampaigns, agencyScripts, agencyPhones, agencyProspects, agencyLeads, agencyPeople, agencyCalls, agencyCallCampaigns };
}
