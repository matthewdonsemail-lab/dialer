/*
 * The dialer API, answered from the demo workspace instead of Twenty.
 *
 * Records come from backend/src/lib/demo (Twenty's shape) and go through the
 * same pure mappers the Express routes use, so every page receives exactly
 * what the real backend would send. Used only by captureScreenshots.ts.
 */
import { buildDemoRecords, DEMO_USER, type DemoRecords } from "../../backend/src/lib/demo/records/index.js";
import { mapProspectDetail, mapProspectListItem } from "../../backend/src/routes/prospects/helpers/mapProspect.js";
import { mapLeadToFrontend } from "../../backend/src/routes/leads/helpers/mapLead.js";
import { mapCall } from "../../backend/src/routes/calls/helpers/mapCall.js";
import { mapPhone } from "../../backend/src/routes/twenty/phones/helpers/mapPhone.js";
import { mapPerson } from "../../backend/src/routes/people/helpers.js";
import { mapCampaign as mapCallCampaign } from "../../backend/src/routes/callCampaigns/helpers.js";
import { mapScript } from "../../backend/src/routes/scripts/helpers/mapScript.js";
import { mapCampaign } from "../../backend/src/routes/campaigns/helpers/mapCampaign.js";

export interface FixtureResponse {
  status: number;
  body: unknown;
}

/** Select options as the Twenty metadata API lists them (schema, not data). */
const OPTIONS: Record<string, Record<string, [string, string, string][]>> = {
  agencyProspects: {
    coldCallStatus: [["NEW", "New", "gray"], ["CONTACTED", "Contacted", "blue"], ["INTERESTED", "Interested", "green"], ["NOT_INTERESTED", "Not Interested", "red"], ["CALLBACK", "Callback", "yellow"], ["CONVERTED", "Converted", "purple"], ["DO_NOT_CONTACT", "Do Not Contact", "black"]],
    outboundLabel: [["NEEDS_ENRICHMENT", "Needs Enrichment", "gray"], ["NEEDS_VIDEO", "Needs Video", "gray"], ["READY_FOR_SMS", "Ready For SMS", "turquoise"], ["SMS_IN_PROGRESS", "SMS In Progress", "blue"], ["FOLLOW_UP_DUE", "Follow Up Due", "yellow"], ["HUMAN_REVIEW", "Human Review", "purple"], ["POSITIVE_REPLY", "Positive Reply", "green"], ["NEGATIVE_REPLY", "Negative Reply", "red"], ["DO_NOT_CONTACT", "Do Not Contact", "red"], ["DELIVERY_FAILED", "Delivery Failed", "red"]],
    outboundState: [["NEW", "New", "gray"], ["ENRICHED", "Enriched", "blue"], ["VIDEO_READY", "Video Ready", "blue"], ["QUEUED", "Queued", "turquoise"], ["SENDING", "Sending", "blue"], ["AWAITING_DELIVERY", "Awaiting Delivery", "blue"], ["AWAITING_REPLY", "Awaiting Reply", "blue"], ["REPLIED", "Replied", "purple"], ["QUALIFIED", "Qualified", "green"], ["BOOKED", "Booked", "green"], ["COMPLETED", "Completed", "green"], ["PAUSED", "Paused", "yellow"], ["OPTED_OUT", "Opted Out", "red"], ["FAILED", "Failed", "red"]],
    videoStatus: [["NONE", "None", "gray"], ["QUEUED", "Queued", "gray"], ["RECORDING", "Recording", "blue"], ["RENDERED", "Rendered", "purple"], ["ATTACHED", "Attached", "green"], ["FAILED", "Failed", "red"]],
    label: [["AUTO_PAINT_AND_BODY_SHOPS", "Auto Paint & Body Shop", "orange"], ["WINDOW_TINTING", "Window Tinting", "blue"], ["AUTO_DETAILING", "Auto Detailing", "turquoise"], ["GENERAL_TRADES", "General Trades", "gray"], ["NURSERY_SCHOOL", "Nursery School", "purple"]],
    utmSource: [["OUTBOUND", "Outbound", "blue"], ["INBOUND", "Inbound", "green"], ["BLENDED", "Blended", "purple"]],
    qualificationStatus: [["QUALIFIED", "Qualified", "green"], ["DISQUALIFIED", "Disqualified", "red"]],
  },
  agencyCalls: {
    direction: [["INBOUND", "Inbound", "blue"], ["OUTBOUND", "Outbound", "green"], ["MISSED", "Missed", "red"]],
    status: [["IN_PROGRESS", "In Progress", "yellow"], ["COMPLETED", "Completed", "green"], ["FAILED", "Failed", "red"], ["NO_ANSWER", "No Answer", "orange"], ["BUSY", "Busy", "purple"]],
    transcriptionStatus: [["NONE", "None", "gray"], ["PENDING", "Pending", "yellow"], ["READY", "Ready", "green"], ["FAILED", "Failed", "red"]],
    disposition: [["INTERESTED", "Interested", "green"], ["APPOINTMENT_SET", "Appointment Set", "green"], ["CALLBACK", "Callback", "turquoise"], ["GOOD_NUMBER", "Good Number", "turquoise"], ["LEFT_CALLBACK", "Left Callback", "sky"], ["VOICEMAIL", "Left Voicemail", "sky"], ["NOT_INTERESTED", "Not Interested", "red"], ["BAD_NUMBER", "Bad Number", "red"], ["NO_ANSWER", "No Answer", "gray"], ["WRONG_NUMBER", "Wrong Number", "orange"], ["DNC", "Do Not Contact", "red"]],
    meetingProvider: [["NONE", "None", "gray"], ["GOOGLE_MEET", "Google Meet", "blue"], ["ZOOM", "Zoom", "purple"], ["TEAMS", "Teams", "orange"], ["OTHER", "Other", "gray"]],
    meetingStatus: [["NONE", "None", "gray"], ["SCHEDULED", "Scheduled", "blue"], ["HELD", "Held", "green"], ["CANCELLED", "Cancelled", "red"], ["NO_SHOW", "No Show", "orange"]],
  },
};
OPTIONS.agencyLeads = { coldCallStatus: OPTIONS.agencyProspects.coldCallStatus };

function meta(object: string) {
  const fields = OPTIONS[object] ?? {};
  return {
    object: { singular: object.replace(/s$/, ""), plural: object },
    baseUrl: "https://twenty.example",
    fields: Object.fromEntries(
      Object.entries(fields).map(([k, opts]) => [k, opts.map(([value, label, color], position) => ({ id: `${k}-${value}`, value, label, color, position }))]),
    ),
  };
}

function lastCallOf(db: DemoRecords, id: string) {
  const c = db.agencyCalls
    .filter((x) => x.agencyProspectId === id || x.agencyLeadId === id)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  return c ? { id: c.id, status: c.disposition || c.status, at: c.startedAt } : null;
}

function contactRows(db: DemoRecords) {
  const prospects = [...db.agencyProspects]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((p) => ({ ...mapProspectListItem(p), type: "prospect", lastCall: lastCallOf(db, p.id) }));
  const leads = db.agencyLeads.map((l) => ({ ...mapLeadToFrontend(l), type: "lead", lastCall: lastCallOf(db, l.id) }));
  return { prospects, leads };
}

function count<T>(rows: T[], key: (r: T) => string | null | undefined) {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = key(r) || "__blank";
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/** Record history for the timeline and the admin log, derived from the records. */
function activity(db: DemoRecords, targets: string | null) {
  const members = Object.fromEntries(db.members.map((m) => [m.id, m.name]));
  const by = (id: string | null | undefined) => {
    const m = db.members.find((x) => x.id === id) ?? db.members[0];
    return { name: m.name, memberId: m.id, source: "MANUAL" };
  };
  const events: any[] = [];
  for (const c of db.agencyCalls.slice(0, 30)) {
    const p = db.agencyProspects.find((x) => x.id === c.agencyProspectId);
    events.push({ id: `${c.id}-c`, happensAt: c.createdAt, action: "created", object: "call", recordId: c.id, recordName: c.name, actor: by(c.createdByMemberId), changes: [] });
    if (c.disposition) events.push({ id: `${c.id}-d`, happensAt: c.updatedAt, action: "updated", object: "call", recordId: c.id, recordName: c.name, actor: by(c.createdByMemberId), changes: [{ field: "disposition", before: null, after: c.disposition }] });
    if (p && c.disposition && ["INTERESTED", "CALLBACK", "NOT_INTERESTED", "APPOINTMENT_SET"].includes(c.disposition)) {
      events.push({ id: `${c.id}-p`, happensAt: c.updatedAt, action: "updated", object: "prospect", recordId: p.id, recordName: p.name, actor: by(c.createdByMemberId), changes: [{ field: "coldCallStatus", before: "CONTACTED", after: p.coldCallStatus }] });
    }
  }
  const featured = db.agencyProspects[0];
  events.push(
    { id: "f-1", happensAt: featured.createdAt, action: "created", object: "prospect", recordId: featured.id, recordName: featured.name, actor: by(featured.createdByMemberId), changes: [] },
    { id: "f-2", happensAt: db.agencyCalls[0].updatedAt, action: "updated", object: "prospect", recordId: featured.id, recordName: featured.name, actor: by(db.members[0].id), changes: [{ field: "outboundLabel", before: "NEEDS_VIDEO", after: "READY_FOR_SMS" }] },
    { id: "f-3", happensAt: db.agencyPeople[0].createdAt, action: "updated", object: "prospect", recordId: featured.id, recordName: featured.name, actor: by(db.members[0].id), changes: [{ field: "videoStatus", before: "QUEUED", after: "ATTACHED" }] },
  );
  for (const l of db.agencyLeads) events.push({ id: `${l.id}-c`, happensAt: l.createdAt, action: "created", object: "lead", recordId: l.id, recordName: l.name, actor: by(l.createdById), changes: [] });
  for (const cc of db.agencyCallCampaigns) events.push({ id: `${cc.id}-c`, happensAt: cc.createdAt, action: "created", object: "callCampaign", recordId: cc.id, recordName: cc.name, actor: by(cc.createdByMemberId), changes: [] });
  events.push({ id: "ph-1", happensAt: db.agencyPhones[2].updatedAt, action: "updated", object: "phone", recordId: db.agencyPhones[2].id, recordName: db.agencyPhones[2].name, actor: by(db.members[3].id), changes: [{ field: "state", before: "ACTIVE", after: "PAUSED" }] });

  let list = events;
  if (targets) {
    const ids = new Set(targets.split(",").map((t) => t.split(":")[1]));
    list = events.filter((e) => ids.has(e.recordId));
  }
  list.sort((a, b) => b.happensAt.localeCompare(a.happensAt));
  return { activities: list, members, totalCount: list.length, truncated: false };
}

function websiteStatus(db: DemoRecords, id: string, pageUrl: string) {
  const p = db.agencyProspects.find((x) => x.id === id);
  if (!p) return null;
  const industryKey = p.label.toLowerCase().replace(/_/g, "-");
  return {
    page: { url: `${pageUrl}?prospect=${p.slug}`, previewAllowed: true, previewBlockedReason: null },
    prospect: {
      id: p.id,
      slug: p.slug,
      niche: p.niche,
      label: p.label,
      labelValue: p.label,
      website: p.website,
      phone: p.phone,
      phoneE164: p.phone,
      country: p.country,
      city: p.city,
      region: p.region,
      videoStatus: p.videoStatus,
      videoSource: "demo",
      videoUrl: { primaryLinkUrl: `https://video.example/${p.slug}`, primaryLinkLabel: "Walkthrough video" },
      outboundState: p.outboundState,
      outboundLabel: p.outboundLabel,
      smsMetadata: null,
      whatsappStatus: "VALIDATED",
    },
    offer: { id: `offer-${industryKey}`, title: `${p.niche} booking page`, heroH1: `${p.name}, booked online`, status: "ACTIVE", ctaType: "BOOKING", videoMode: "PROSPECT", industryId: p.label, videoUrl: null },
    urls: {
      industryId: p.label,
      industryKey,
      pack: industryKey,
      slug: p.slug,
      offerDisplayUrl: `offer.example/${industryKey}/${p.slug}`,
      funnelSrc: `${pageUrl}?prospect=${p.slug}`,
      templateUrl: `${pageUrl}?prospect=${p.slug}`,
      templateAvailable: true,
    },
  };
}

/**
 * Answers one API request from the demo workspace, or null when the path is
 * not one the dialer calls (the capture logs those so a new endpoint is noticed).
 * `pageUrl` is where the capture serves the stand-in prospect page.
 */
export function respond(method: string, url: URL, pageUrl: string): FixtureResponse | null {
  const db = buildDemoRecords();
  const path = url.pathname;
  const q = url.searchParams;
  const ok = (body: unknown): FixtureResponse => ({ status: 200, body });

  if (method === "POST" && path === "/api/messages/send") {
    return { status: 201, body: { failed: false, message: { id: `sent-${Date.now()}`, direction: "OUTBOUND", body: "Sent from the demo", fromNumber: "+15125550100", toNumber: null, status: "queued", at: new Date().toISOString(), author: "Alex Rivera" } } };
  }
  if (method !== "GET") return ok({ ok: true, success: true });
  if (path === "/api/messages") {
    const id = url.searchParams.get("contactId");
    const contact = db.agencyProspects.find((p) => p.id === id);
    if (!contact || contact.id !== db.agencyProspects[0].id) return ok({ numbers: contact ? [contact.phone] : [], messages: [] });
    const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
    const ours = (body: string, minutesAgo: number, status: string) => ({ id: `t${minutesAgo}`, direction: "OUTBOUND", body, fromNumber: "+15125550100", toNumber: contact.phone, status, at: at(minutesAgo), author: "Alex Rivera" });
    const theirs = (body: string, minutesAgo: number) => ({ id: `t${minutesAgo}`, direction: "INBOUND", body, fromNumber: contact.phone, toNumber: "+15125550100", status: "received", at: at(minutesAgo), author: null });
    return ok({
      numbers: [contact.phone],
      messages: [
        ours("Hi Maria, it's Alex. Here's the booking page for Clearview, with your reviews and prices: https://offer.example/window-tinting/clearview-window-tint", 38, "delivered"),
        theirs("Oh nice, that was quick. Can customers pick a time slot on it?", 31),
        ours("Yes, they choose a slot and get a text reminder the day before. Want me to switch it on for Thursday?", 29, "delivered"),
        theirs("Yes please. Talk Thursday.", 12),
        { ...ours("Booked: Thursday 10:00. I'll call the shop line.", 6, "delivery_failed"), error: "Not 10DLC registered (40010)" },
      ],
    });
  }

  if (path === "/api/auth/me") {
    return ok({ id: DEMO_USER.id, email: DEMO_USER.email, fullName: DEMO_USER.name, role: "admin", twentyUserId: DEMO_USER.id, workspaceMemberId: DEMO_USER.id, member: { id: DEMO_USER.id, name: DEMO_USER.name, avatarUrl: "" } });
  }
  if (path === "/api/health") return ok({ status: "ok", timestamp: new Date().toISOString(), twentyCrm: { apiKeyConfigured: true, oauthConfigured: true, oauthMessage: "Twenty OAuth is configured." } });
  if (path === "/api/oauth/config") return ok({ clientId: "demo", authorizeUrl: "https://twenty.example/authorize", redirectUri: `${url.origin}/callback`, scope: "api profile" });
  if (path === "/api/audio-sessions/config") return ok({ callMeAvailable: true, dialInAvailable: false, dialInNumber: null, missing: ["TELNYX_DIAL_IN_NUMBER"] });

  const { prospects, leads } = contactRows(db);
  if (path === "/api/prospects/page") {
    const types = (q.get("type") || "prospect|lead").split("|");
    const all = [...(types.includes("prospect") ? prospects : []), ...(types.includes("lead") ? leads : [])];
    const offset = Number(q.get("offset") || 0);
    const limit = Number(q.get("limit") || 50);
    return ok({ offset, rows: all.slice(offset, offset + limit), totalCount: all.length, counts: { prospect: types.includes("prospect") ? prospects.length : 0, lead: types.includes("lead") ? leads.length : 0 } });
  }
  if (path === "/api/prospects/facets") {
    const raw = db.agencyProspects;
    return ok({
      total: raw.length + db.agencyLeads.length,
      type: { prospect: raw.length, lead: db.agencyLeads.length },
      status: count(raw, (p) => p.coldCallStatus),
      country: count(raw, (p) => p.country),
      industry: count(raw, (p) => p.niche),
      campaign: count(raw, (p) => p.campaignIdId),
      creator: raw.length,
    });
  }
  if (path === "/api/prospects/lookup") {
    const ids = new Set((q.get("ids") || "").split(","));
    return ok([...prospects, ...leads].filter((r) => ids.has(r.id)));
  }
  let m = /^\/api\/prospects\/([^/]+)\/website-status$/.exec(path);
  if (m) {
    const body = websiteStatus(db, m[1], pageUrl);
    return body ? ok(body) : { status: 404, body: { error: "Prospect not found" } };
  }
  m = /^\/api\/prospects\/([^/]+)$/.exec(path);
  if (m) {
    const p = db.agencyProspects.find((x) => x.id === m![1]);
    return p ? ok(mapProspectDetail(p)) : { status: 404, body: { error: "Prospect not found" } };
  }
  if (path === "/api/leads") return ok(db.agencyLeads.map((l) => mapLeadToFrontend(l)));
  m = /^\/api\/leads\/([^/]+)$/.exec(path);
  if (m) {
    const l = db.agencyLeads.find((x) => x.id === m![1]);
    return l ? ok(mapLeadToFrontend(l)) : { status: 404, body: { error: "Lead not found" } };
  }
  if (path === "/api/campaigns") return ok(db.agencyCampaigns.map(mapCampaign));
  if (path === "/api/scripts") return ok(db.agencyScripts.map(mapScript));
  if (path === "/api/call-campaigns") return ok(db.agencyCallCampaigns.map(mapCallCampaign));
  if (path === "/api/twenty/phones") return ok(db.agencyPhones.map(mapPhone));
  if (path === "/api/twenty/phones/primary") return ok({ phone: mapPhone(db.agencyPhones[0]), isPrimary: true, total: db.agencyPhones.length });
  m = /^\/api\/twenty\/meta\/([^/]+)$/.exec(path);
  if (m) return ok(meta(m[1]));
  if (path === "/api/people") {
    const id = q.get("prospectId") || q.get("leadId");
    return ok(db.agencyPeople.filter((p) => p.prospectId === id).map(mapPerson));
  }
  const calls = [...db.agencyCalls].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).map(mapCall);
  if (path === "/api/calls") return ok(calls);
  m = /^\/api\/calls\/([^/]+)\/audio$/.exec(path);
  if (m) return ok({ url: `${url.origin}/__demo/recording.wav` });
  m = /^\/api\/calls\/([^/]+)$/.exec(path);
  if (m) {
    const c = calls.find((x) => x.id === m![1]);
    return c ? ok(c) : { status: 404, body: { error: "Call not found" } };
  }
  if (path === "/api/admin/activity") return ok(activity(db, q.get("targets")));
  if (path === "/api/call-logs" || path === "/api/profiles") return ok([]);
  return null;
}
