import { Hono } from "hono";
import { ctx, files } from "@railcode/sdk";
import {
  listTwenty, listTwentyPage, getTwenty, createTwenty, updateTwenty, deleteTwenty,
  fetchTwentyMeta, twentyError,
} from "./lib/twenty.js";
import { setupTwentyCRM } from "./lib/setup.js";

// Cold Dialer worker: faithful port of the node01 Express backend.
// Twenty CRM is reached through the org's `twenty` HTTP connector (bearer),
// so the worker holds no API key. Identity comes from the platform gate:
// ctx.user is verified per request, and the dialer's old JWT/password flow
// is gone — the frontend uses /api/auth/me (platform sign-in) instead.
// Twenty REST objects remain the system of record for leads/prospects/
// campaigns/scripts/call-logs/profiles/phones; files holds recordings.

const app = new Hono();

export interface PlatformUser {
  userId: string;
  email: string;
  fullName: string;
}

function err(c: any, e: any, fallback: string, fallbackStatus = 500) {
  const status = typeof e?.status === "number" ? e.status : fallbackStatus;
  return c.json({ error: status >= 500 ? fallback : (e?.message || fallback), details: e?.message }, status);
}

function needAuth(c: any): PlatformUser | null {
  const u = ctx.user;
  if (!u) return null;
  return { userId: u.id, email: u.email, fullName: u.name || u.email };
}

function requireAuthResult(c: any, u: PlatformUser | null) {
  if (!u) return c.json({ error: "Not signed in" }, 401);
  return null;
}

// ---------- health ----------

app.get("/api/health", (c) =>
  c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    twentyCrm: {
      apiKeyConfigured: true,
      databaseUrlConfigured: false,
      databaseMessage: "Railcode build reaches Twenty through the org twenty connector; Postgres is not used.",
    },
  }),
);

// ---------- auth (platform identity; no passwords, no JWT) ----------

app.get("/api/auth/me", (c) => {
  const u = needAuth(c);
  const denied = requireAuthResult(c, u);
  if (denied) return denied;
  return c.json({ id: u!.userId, email: u!.email, fullName: u!.fullName, role: "agent", twentyUserId: u!.userId });
});

// ---------- shared mappers (ported 1:1 from Express routes) ----------

const LEAD_STATUS_MAP: Record<string, string> = {
  NEW: "new", CONTACTED: "contacted", QUALIFIED: "interested",
  BOOKED: "callback", CONVERTED: "converted", LOST: "not_interested",
};

const PROSPECT_STATUS_MAP: Record<string, string> = {
  NEW: "new", CONTACTED: "contacted", INTERESTED: "interested",
  NOT_INTERESTED: "not_interested", CALLBACK: "callback",
  CONVERTED: "converted", DO_NOT_CONTACT: "do_not_contact",
};

function leadToFrontend(lead: any, campaignMap: Record<string, string> = {}) {
  const fullName = lead.name || lead.contactName || "";
  const parts = fullName.split(" ");
  const status = lead.coldCallStatus ? LEAD_STATUS_MAP[lead.coldCallStatus] || "new" : lead.status ? LEAD_STATUS_MAP[lead.status] || "new" : "new";
  return {
    id: lead.id,
    first_name: parts[0] || undefined,
    last_name: parts.slice(1).join(" ") || undefined,
    company: lead.company,
    phone: lead.phone?.primaryPhoneNumber,
    email: lead.email,
    website: undefined, address: undefined, city: undefined, state: undefined, zip: undefined,
    status,
    source: lead.source,
    campaign_id: lead.campaignIdId || undefined,
    campaign_type: lead.createdById ? campaignMap[lead.createdById] || undefined : undefined,
    assigned_to: lead.createdById,
    tags: null,
    notes: lead.note,
    dnc: status === "not_interested" || status === "converted",
    last_called_at: null, call_count: 0,
    sync_id: lead.outboundMessage,
    created_at: lead.createdAt || new Date().toISOString(),
    updated_at: lead.updatedAt || new Date().toISOString(),
  };
}

function toTwentyLeadStatus(status: string | undefined, dnc: any): string {
  if (dnc) return "DO_NOT_CONTACT";
  return status === "contacted" ? "CONTACTED"
    : status === "interested" ? "INTERESTED"
    : status === "callback" ? "CALLBACK"
    : status === "converted" ? "CONVERTED"
    : status === "not_interested" ? "NOT_INTERESTED" : "NEW";
}

async function campaignTypeMap(): Promise<Record<string, string>> {
  try {
    const campaigns = await listTwenty<any>("agencyCampaigns", 100);
    return Object.fromEntries(campaigns.map((x: any) => [x.id, x.utmSource || "outbound"]));
  } catch {
    return {};
  }
}

function prospectToFrontendList(p: any) {
  const nameParts = (p.name || "").split(" ");
  const addressParts = (p.fullAddress || "").split(",").map((s: string) => s.trim());
  const status = p.coldCallStatus ? PROSPECT_STATUS_MAP[p.coldCallStatus] || "new" : "new";
  return {
    id: p.id,
    first_name: nameParts[0] || undefined,
    last_name: nameParts.slice(1).join(" ") || undefined,
    company: p.niche || "—",
    phone: p.phone, email: p.email, website: p.website,
    address: addressParts[0] || "",
    city: p.city || addressParts[1] || "",
    state: p.region || addressParts[2] || "",
    zip: addressParts[3] || "",
    status,
    source: p.niche || "twenty-import",
    // Industry / niche (live Twenty shape)
    slug: p.slug,
    niche: p.niche,
    label: selectValue(p.label),
    labelValue: selectValue(p.label),
    country: p.country,
    rating: p.rating,
    reviewCount: p.reviewCount,
    // Messaging shape (SMS pipeline + WhatsApp)
    outboundState: selectValue(p.outboundState),
    outboundLabel: selectValue(p.outboundLabel),
    smsMetadata: p.smsMetadata ?? null,
    phoneValid: p.phoneValid ?? null,
    whatsappStatus: selectValue(p.whatsappStatus),
    whatsappValidated: p.whatsappValidated ?? null,
    phoneNumber: p.phoneNumber ?? null,
    primaryPhone: p.primaryPhone ?? null,
    ghlWebhookUrl: p.ghlWebhookUrl,
    googleReviewsUrl: p.googleReviewsUrl,
    // Video pipeline
    videoStatus: selectValue(p.videoStatus),
    videoSource: p.videoSource,
    videoError: p.videoError,
    videoUrl: p.videoUrl ?? null,
    campaign_id: p.campaignIdId || undefined,
    campaign_type: p.utmSource ? (p.utmSource === "outbound" ? "outbound" : p.utmSource === "inbound" ? "inbound" : "blended") : undefined,
    assigned_to: undefined,
    tags: p.outboundState ? [p.outboundState] : null,
    notes: p.outboundLabel || undefined,
    dnc: status === "not_interested" || status === "do_not_contact",
    last_contacted_at: null, contact_count: 0,
    sync_id: p.externalId,
    created_at: p.createdAt || new Date().toISOString(),
    updated_at: p.updatedAt || new Date().toISOString(),
  };
}

function mapCampaignStatus(s: string | undefined): string {
  if (!s) return "draft";
  const u = s.toUpperCase();
  if (u === "ACTIVE") return "active";
  if (u === "INACTIVE") return "paused";
  return "draft";
}

function mapCampaignType(t: string | undefined): string {
  if (!t) return "OUTBOUND";
  const map: Record<string, string> = {
    outbound: "OUTBOUND", inbound: "INBOUND", blended: "BLENDED", referral: "REFERRAL",
    "cold-call": "COLD_CALL", cold_call: "COLD_CALL", website: "WEBSITE",
    "twenty-import": "TWENTY_IMPORT", twenty_import: "TWENTY_IMPORT", other: "OTHER",
  };
  return map[t.toLowerCase()] || "OUTBOUND";
}

function campaignToFrontend(x: any) {
  return {
    id: x.id,
    name: x.name || "Unnamed Campaign",
    type: x.campaignType?.toLowerCase().replace("_", "-") || "outbound",
    status: mapCampaignStatus(x.status),
    settings: x.note ? JSON.parse(x.note) : null,
    created_at: x.createdAt || new Date().toISOString(),
    updated_at: x.updatedAt || new Date().toISOString(),
  };
}

// ---------- SendWebsiteWidget helpers (ported from Express backend) ----------

// Twenty SELECT fields may arrive as a plain string value or as { value, label }.
function selectValue(v: unknown): string | undefined {
  if (typeof v === "string") return v || undefined;
  if (v && typeof v === "object") {
    const o = v as { value?: unknown; label?: unknown };
    if (typeof o.value === "string" && o.value) return o.value;
    if (typeof o.label === "string" && o.label) return o.label;
  }
  return undefined;
}

function slugifyIndustryValue(niche: string): string {
  // Display-only fallback for the label badge when a prospect has no label.
  const value = niche.trim().toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_");
  return value.length > 0 ? value : "UNLABELED";
}

/**
 * Industry routing read from the agencyCampaign row — the only source of
 * urlKey/funnel/template bases. Linked campaign first, else the campaign
 * whose industryId matches the prospect label. Null = unconfigured
 * (callers surface explicit states, never invented defaults).
 */
async function resolveIndustryRouting(prospect: any): Promise<{
  urlKey: string; funnelBaseUrl?: string; templateBaseUrl?: string; packDir?: string;
} | null> {
  const linked: any = prospect?.campaignId ?? prospect?.campaignIdId;
  const linkedId = typeof linked === "string" ? linked : linked?.id;
  if (linkedId) {
    try {
      const campaign: any = await getTwenty<any>("agencyCampaigns", linkedId);
      if (campaign?.urlKey) return campaign;
    } catch {
      // fall through to industryId filter
    }
  }
  const label = selectValue(prospect?.label);
  if (!label) return null;
  try {
    const campaigns = await listTwenty<any>("agencyCampaigns", {
      limit: 1,
      filter: `industryId[eq]:${label}`,
    });
    if (campaigns[0]?.urlKey) return campaigns[0];
  } catch {
    // unconfigured
  }
  return null;
}

function scriptToFrontend(s: any) {
  return {
    id: s.id,
    name: s.name || "Unnamed Script",
    campaignId: s.campaignIdId || null,
    scriptData: s.scriptData ? JSON.parse(s.scriptData) : null,
    created_at: s.createdAt || new Date().toISOString(),
    updated_at: s.updatedAt || new Date().toISOString(),
  };
}

// ---------- leads ----------

app.get("/api/leads", async (c) => {
  const u = await needAuth(c);
  const denied = requireAuthResult(c, u);
  if (denied) return denied;
  try {
    const map = await campaignTypeMap();
    // Full collection in one response: the worker walks every id-keyset page
    // server-side (Twenty has no working cursor params), so the client never
    // paginates. Bounded at 15 pages x 200.
    const all: any[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 15; page++) {
      const { records, pageInfo } = await listTwentyPage<any>("agencyLeads", { limit: 200, startingAfter: cursor });
      all.push(...records);
      if (!pageInfo.hasNextPage || !pageInfo.endCursor) break;
      cursor = pageInfo.endCursor;
    }
    return c.json(all.map((l) => leadToFrontend(l, map)));
  } catch (e: any) {
    return err(c, e, "Failed to fetch leads from Twenty");
  }
});

app.get("/api/leads/:id", async (c) => {
  const u = await needAuth(c);
  const denied = requireAuthResult(c, u);
  if (denied) return denied;
  try {
    const lead = await getTwenty<any>("agencyLeads", c.req.param("id"));
    const map = await campaignTypeMap();
    return c.json(leadToFrontend(lead, map));
  } catch (e: any) {
    return c.json({ error: "Lead not found" }, 404);
  }
});

app.post("/api/leads", async (c) => {
  const u = await needAuth(c);
  const denied = requireAuthResult(c, u);
  if (denied) return denied;
  try {
    const { first_name, last_name, company, phone, email, source, campaign_id, assigned_to, tags, notes, dnc, status } =
      (await c.req.json().catch(() => ({}))) as any;
    const fullName = [first_name, last_name].filter(Boolean).join(" ").trim();
    const coldCallStatus = toTwentyLeadStatus(status, dnc);
    const payload = {
      contactName: fullName,
      email,
      phone: phone ? { primaryPhoneNumber: String(phone).replace(/\D/g, ""), primaryPhoneCountryCode: "", primaryPhoneCallingCode: "", additionalPhones: [] } : undefined,
      company,
      status: coldCallStatus === "DO_NOT_CONTACT" ? "LOST" : "NEW",
      coldCallStatus,
      source,
      note: notes,
      outboundMessage: undefined,
      createdById: u!.userId,
    };
    const result = await createTwenty<any>("agencyLeads", payload);
    const lead = (result as any).data || result;
    return c.json({
      id: lead.id, first_name, last_name, company, phone, email,
      website: undefined, address: undefined, city: undefined, state: undefined, zip: undefined,
      status: coldCallStatus === "DO_NOT_CONTACT" ? "not_interested" : "new",
      source, campaign_id, assigned_to: u!.userId,
      tags: tags ? JSON.stringify(tags) : null, notes, dnc: Boolean(dnc),
      last_called_at: null, call_count: 0,
      sync_id: lead.outboundMessage || undefined,
      created_at: lead.createdAt || new Date().toISOString(),
      updated_at: lead.updatedAt || new Date().toISOString(),
    }, 201);
  } catch (e: any) {
    return err(c, e, "Failed to create lead in Twenty");
  }
});

app.patch("/api/leads/:id", async (c) => {
  const u = await needAuth(c);
  const denied = requireAuthResult(c, u);
  if (denied) return denied;
  try {
    const { first_name, last_name, company, phone, email, notes, source, campaign_id, status, dnc } =
      (await c.req.json().catch(() => ({}))) as any;
    const payload: any = {};
    if (first_name !== undefined || last_name !== undefined) {
      const fullName = [first_name, last_name].filter(Boolean).join(" ").trim();
      if (fullName) payload.contactName = fullName;
    }
    if (company !== undefined) payload.company = company;
    if (phone !== undefined) {
      payload.phone = phone ? { primaryPhoneNumber: String(phone).replace(/\D/g, ""), primaryPhoneCountryCode: "", primaryPhoneCallingCode: "", additionalPhones: [] } : undefined;
    }
    if (email !== undefined) payload.email = email;
    if (notes !== undefined) payload.note = notes;
    if (source !== undefined) payload.source = source;
    if (campaign_id !== undefined) payload.campaignIdId = campaign_id || null;
    if (status !== undefined) payload.coldCallStatus = toTwentyLeadStatus(status, dnc);
    if (Object.keys(payload).length === 0) return c.json({ error: "No fields to update" }, 400);
    const result = await updateTwenty<any>("agencyLeads", c.req.param("id"), payload);
    const lead = (result as any).data || result;
    const map = await campaignTypeMap();
    return c.json(leadToFrontend(lead, map));
  } catch (e: any) {
    return err(c, e, "Failed to update lead in Twenty");
  }
});

app.delete("/api/leads/:id", async (c) => {
  const u = await needAuth(c);
  const denied = requireAuthResult(c, u);
  if (denied) return denied;
  try {
    await deleteTwenty("agencyLeads", c.req.param("id"));
    return c.body(null, 204);
  } catch (e: any) {
    return err(c, e, "Failed to delete lead from Twenty");
  }
});

// ---------- prospects ----------

app.get("/api/prospects", async (c) => {
  const u = await needAuth(c);
  const denied = requireAuthResult(c, u);
  if (denied) return denied;
  try {
    // Full collection in one response: the worker walks every id-keyset page
    // server-side (Twenty has no working cursor params), so the client never
    // paginates. Bounded at 15 pages x 200.
    const all: any[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 15; page++) {
      const { records, pageInfo } = await listTwentyPage<any>("agencyProspects", { limit: 200, startingAfter: cursor });
      all.push(...records);
      if (!pageInfo.hasNextPage || !pageInfo.endCursor) break;
      cursor = pageInfo.endCursor;
    }
    return c.json(all.map(prospectToFrontendList));
  } catch (e: any) {
    return err(c, e, "Failed to fetch prospects from Twenty");
  }
});

app.get("/api/prospects/:id", async (c) => {
  const u = await needAuth(c);
  const denied = requireAuthResult(c, u);
  if (denied) return denied;
  try {
    const p = await getTwenty<any>("agencyProspects", c.req.param("id"));
    const addressParts = (p.fullAddress || "").split(",").map((s: string) => s.trim());
    const nameParts = (p.name || "").split(" ");
    const status = p.coldCallStatus ? PROSPECT_STATUS_MAP[p.coldCallStatus] || "new" : "new";
    return c.json({
      id: p.id,
      first_name: nameParts[0] || undefined,
      last_name: nameParts.slice(1).join(" ") || undefined,
      company: p.niche || "—",
      phone: p.phone, email: p.email, website: p.website,
      address: addressParts[0],
      city: p.city || addressParts[1],
      state: p.region || addressParts[2],
      zip: addressParts[3],
      status,
      source: p.niche || "twenty-import",
      // Industry / niche (live Twenty shape)
      slug: p.slug,
      niche: p.niche,
      label: selectValue(p.label),
      labelValue: selectValue(p.label),
      country: p.country,
      rating: p.rating,
      reviewCount: p.reviewCount,
      // Messaging shape (SMS pipeline + WhatsApp)
      outboundState: selectValue(p.outboundState),
      outboundLabel: selectValue(p.outboundLabel),
      smsMetadata: p.smsMetadata ?? null,
      phoneValid: p.phoneValid ?? null,
      whatsappStatus: selectValue(p.whatsappStatus),
      whatsappValidated: p.whatsappValidated ?? null,
      phoneNumber: p.phoneNumber ?? null,
      primaryPhone: p.primaryPhone ?? null,
      ghlWebhookUrl: p.ghlWebhookUrl,
      googleReviewsUrl: p.googleReviewsUrl,
      // Video pipeline
      videoStatus: selectValue(p.videoStatus),
      videoSource: p.videoSource,
      videoError: p.videoError,
      videoUrl: p.videoUrl ?? null,
      campaign_id: p.campaignIdId || undefined,
      campaign_type: p.utmSource ? (p.utmSource === "outbound" ? "outbound" : p.utmSource === "inbound" ? "inbound" : "blended") : undefined,
      tags: p.outboundState ? [p.outboundState] : null,
      notes: p.outboundLabel,
      dnc: status === "not_interested" || status === "do_not_contact",
      sync_id: p.externalId,
      created_at: p.createdAt || new Date().toISOString(),
      updated_at: p.updatedAt || new Date().toISOString(),
    });
  } catch (e: any) {
    return c.json({ error: "Prospect not found" }, 404);
  }
});

app.post("/api/prospects", async (c) => {
  const u = await needAuth(c);
  const denied = requireAuthResult(c, u);
  if (denied) return denied;
  try {
    const { first_name, last_name, phone, email, website, address, city, state, zip, status, source, tags, notes, dnc } =
      (await c.req.json().catch(() => ({}))) as any;
    const fullName = [first_name, last_name].filter(Boolean).join(" ").trim();
    const fullAddress = [address, city, state, zip].filter(Boolean).join(", ");
    const coldCallStatus = toTwentyLeadStatus(status, dnc) === "DO_NOT_CONTACT" ? "DO_NOT_CONTACT"
      : status === "contacted" ? "CONTACTED"
      : status === "interested" ? "INTERESTED"
      : status === "callback" ? "CALLBACK"
      : status === "converted" ? "CONVERTED"
      : status === "not_interested" ? "NOT_INTERESTED" : "NEW";
    const payload = {
      name: fullName, phone, email, website,
      fullAddress: fullAddress || undefined, city, region: state, country: "US",
      niche: source || "general", rating: 0, reviewCount: 0,
      externalId: undefined, outboundState: tags?.[0], coldCallStatus,
    };
    const result = await createTwenty<any>("agencyProspects", payload);
    const p = (result as any).data || result;
    return c.json({
      id: p.id, first_name, last_name, phone, email, website, address, city, state, zip,
      status: coldCallStatus === "DO_NOT_CONTACT" ? "do_not_contact" : "new",
      source, tags: tags || null, notes, dnc: Boolean(dnc),
      sync_id: p.externalId,
      created_at: p.createdAt || new Date().toISOString(),
      updated_at: p.updatedAt || new Date().toISOString(),
    }, 201);
  } catch (e: any) {
    return err(c, e, "Failed to create prospect in Twenty");
  }
});

app.patch("/api/prospects/:id", async (c) => {
  const u = await needAuth(c);
  const denied = requireAuthResult(c, u);
  if (denied) return denied;
  try {
    const { first_name, last_name, phone, email, website, address, city, state, zip, status, source, tags, notes, dnc, campaign_id } =
      (await c.req.json().catch(() => ({}))) as any;
    const payload: any = {};
    if (first_name !== undefined || last_name !== undefined) {
      const fullName = [first_name, last_name].filter(Boolean).join(" ").trim();
      if (fullName) payload.name = fullName;
    }
    if (phone !== undefined) payload.phone = phone;
    if (email !== undefined) payload.email = email;
    if (website !== undefined) payload.website = website;
    if (address !== undefined || city !== undefined || state !== undefined || zip !== undefined) {
      const fullAddress = [address, city, state, zip].filter(Boolean).join(", ");
      if (fullAddress) payload.fullAddress = fullAddress;
    }
    if (city !== undefined) payload.city = city;
    if (state !== undefined) payload.region = state;
    if (source !== undefined) payload.niche = source;
    if (notes !== undefined) payload.outboundLabel = notes;
    if (tags?.[0] !== undefined) payload.outboundState = tags[0];
    if (campaign_id !== undefined) payload.campaignIdId = campaign_id || null;
    if (status !== undefined) {
      payload.coldCallStatus = dnc ? "DO_NOT_CONTACT"
        : status === "contacted" ? "CONTACTED"
        : status === "interested" ? "INTERESTED"
        : status === "callback" ? "CALLBACK"
        : status === "converted" ? "CONVERTED"
        : status === "not_interested" ? "NOT_INTERESTED" : "NEW";
    }
    if (Object.keys(payload).length === 0) return c.json({ error: "No fields to update" }, 400);
    const result = await updateTwenty<any>("agencyProspects", c.req.param("id"), payload);
    const p = (result as any).data || result;
    const mappedStatus = p.coldCallStatus ? PROSPECT_STATUS_MAP[p.coldCallStatus] || "new" : "new";
    const nameParts = (p.name || "").split(" ");
    return c.json({
      id: p.id,
      first_name: nameParts[0] || undefined,
      last_name: nameParts.slice(1).join(" ") || undefined,
      company: p.niche || "—",
      phone: p.phone, email: p.email,
      website: undefined, address: undefined, city: undefined, state: undefined, zip: undefined,
      status: mappedStatus,
      source: p.source || undefined,
      campaign_id: p.campaignIdId || undefined,
      notes: p.note || null,
      dnc: mappedStatus === "not_interested" || mappedStatus === "converted",
      last_called_at: null, call_count: 0,
      created_at: p.createdAt || new Date().toISOString(),
      updated_at: p.updatedAt || new Date().toISOString(),
    });
  } catch (e: any) {
    return err(c, e, "Failed to update prospect in Twenty");
  }
});

app.delete("/api/prospects/:id", async (c) => {
  const u = await needAuth(c);
  const denied = requireAuthResult(c, u);
  if (denied) return denied;
  try {
    await deleteTwenty("agencyProspects", c.req.param("id"));
    return c.body(null, 204);
  } catch (e: any) {
    return err(c, e, "Failed to delete prospect from Twenty");
  }
});

// ---------- SendWebsiteWidget (ported from Express backend) ----------

app.get("/api/prospects/:id/website-status", async (c) => {
  const u = await needAuth(c);
  const denied = requireAuthResult(c, u);
  if (denied) return denied;
  try {
    const id = c.req.param("id");
    const p = await getTwenty<any>("agencyProspects", id);

    const niche = p.niche || "";
    const labelValue = selectValue(p.label) || (niche ? slugifyIndustryValue(niche) : "UNLABELED");
    const slug = p.slug || "";
    const routing = await resolveIndustryRouting(p);
    const industryKey = routing?.urlKey || null;
    const funnelBase = (routing?.funnelBaseUrl || "").replace(/\/$/, "");
    const templateBase = (routing?.templateBaseUrl || "").replace(/\/$/, "");
    const pack = routing?.packDir || null;

    // Offer lookup: the INDUSTRY row, never the per-prospect row.
    let offer: any = null;
    try {
      const offers = await listTwenty<any>("agencyOffers", { limit: 1, filter: `name[eq]:INDUSTRY:${industryKey}` });
      offer = offers[0] ?? null;
    } catch {
      // No industry offer yet — widget shows the create state
    }

    // Effective video: industry CUSTOM override wins, else the prospect video.
    const pVideoUrl = typeof p.videoUrl === "string" ? p.videoUrl : p.videoUrl?.primaryLinkUrl || undefined;
    const oMode = String(offer?.videoMode || "PROSPECT").toUpperCase();
    const oOverride = typeof offer?.videoUrl === "string" ? offer.videoUrl : offer?.videoUrl?.primaryLinkUrl || undefined;
    const effectiveVideoUrl = oMode === "CUSTOM" && oOverride ? oOverride : pVideoUrl;

    // Canonical phone: PHONES composite first, legacy TEXT fallback.
    const phoneE164 = p.phoneNumber?.primaryPhoneNumber || p.primaryPhone?.primaryPhoneNumber || p.phone;

    // Absolute "website we built" URL: phi /offer/:industry/:slug lineup
    // (same slug as the funnel). Null when unconfigured — never invented.
    // No trailing slash (the Vercel rewrites match slash-less paths).
    const templateKey = slug || p.id;
    const templateUrl = industryKey && templateBase ? `${templateBase}/offer/${industryKey}/${templateKey}` : null;
    const funnelSrc = funnelBase ? `${funnelBase}/offer/prospect/${p.id}` : null;

    return c.json({
      prospect: {
        id: p.id,
        slug,
        niche,
        label: selectValue(p.label),
        labelValue,
        website: p.website,
        phone: p.phone,
        phoneE164,
        country: p.country,
        city: p.city,
        region: p.region,
        videoStatus: selectValue(p.videoStatus),
        videoSource: p.videoSource,
        videoError: p.videoError,
        videoUrl: p.videoUrl ?? null,
        outboundState: selectValue(p.outboundState),
        outboundLabel: selectValue(p.outboundLabel),
        smsMetadata: p.smsMetadata ?? null,
        whatsappStatus: selectValue(p.whatsappStatus),
      },
      offer: offer ? {
        id: offer.id,
        title: offer.title,
        heroH1: offer.heroH1,
        status: offer.status,
        ctaType: offer.ctaType,
        videoMode: offer.videoMode,
        industryId: offer.industryId,
        videoUrl: effectiveVideoUrl ? { primaryLinkUrl: effectiveVideoUrl } : (offer.videoUrl ?? null),
      } : null,
      urls: {
        industryKey,
        pack,
        slug,
        offerDisplayUrl: industryKey && slug ? `/offer/${industryKey}/${slug}` : null,
        funnelSrc,
        templateUrl,
        templateAvailable: templateUrl !== null,
      },
    });
  } catch (e: any) {
    return c.json({ error: "Prospect not found" }, 404);
  }
});

app.post("/api/prospects/:id/website-sent", async (c) => {
  const u = await needAuth(c);
  const denied = requireAuthResult(c, u);
  if (denied) return denied;
  try {
    const id = c.req.param("id");
    const { templateUrl, offerUrl, fromNumber, body } = (await c.req.json().catch(() => ({}))) as any;
    const sentAt = new Date().toISOString();

    let advancedLabel: string | null = null;
    try {
      const current = await getTwenty<any>("agencyProspects", id);
      const currentLabel = selectValue(current.outboundLabel);
      if (!currentLabel || ["NEEDS_ENRICHMENT", "NEEDS_VIDEO", "READY_FOR_SMS"].includes(currentLabel)) {
        await updateTwenty("agencyProspects", id, { outboundLabel: "SMS_IN_PROGRESS" });
        advancedLabel = "SMS_IN_PROGRESS";
      }
    } catch {
      // Label advance is best-effort; the sent log still counts
    }

    return c.json({
      success: true,
      prospectId: id,
      sentAt,
      templateUrl: templateUrl ?? null,
      offerUrl: offerUrl ?? null,
      fromNumber: fromNumber ?? null,
      bodyPreview: typeof body === "string" ? body.slice(0, 280) : null,
      outboundLabel: advancedLabel,
    });
  } catch (e: any) {
    return err(c, e, "Failed to log website sent");
  }
});

app.post("/api/prospects/:id/ensure-offer", async (c) => {
  const u = await needAuth(c);
  const denied = requireAuthResult(c, u);
  if (denied) return denied;
  try {
    const id = c.req.param("id");
    const prospect = await getTwenty<any>("agencyProspects", id);
    const routing = await resolveIndustryRouting(prospect);
    if (!routing?.urlKey) {
      return c.json({ error: "Industry not configured for prospect" }, 404);
    }
    const industryKey = routing.urlKey;
    const twentyValue = selectValue((routing as any).industryId) || selectValue(prospect.label) || "";
    const rowName = `INDUSTRY:${industryKey}`;

    const existing = await listTwenty<any>("agencyOffers", { limit: 1, filter: `name[eq]:${rowName}` });
    if (existing[0]) return c.json({ action: "existing" as const, industryKey, offer: existing[0] });

    // Neutral seed copy only — the operator tailors it in the builder.
    const created = await createTwenty<any>("agencyOffers", {
      name: rowName,
      title: `Free Consultation`,
      heroH1: `Book Your Free Consultation`,
      heroLede: {
        blocknote: null,
        markdown: `Answer a few quick questions and book your free consultation call.`,
      },
      status: "ACTIVE",
      industryId: twentyValue || undefined,
      videoMode: "PROSPECT",
    });
    return c.json({ action: "created" as const, industryKey, offer: created }, 201);
  } catch (e: any) {
    return err(c, e, "Failed to ensure offer");
  }
});

// ---------- campaigns ----------

app.get("/api/campaigns", async (c) => {
  const u = await needAuth(c);
  const denied = requireAuthResult(c, u);
  if (denied) return denied;
  try {
    const campaigns = await listTwenty<any>("agencyCampaigns", 100);
    return c.json(campaigns.map(campaignToFrontend));
  } catch (e: any) {
    return err(c, e, "Failed to fetch campaigns from Twenty");
  }
});

app.get("/api/campaigns/:id", async (c) => {
  const u = await needAuth(c);
  const denied = requireAuthResult(c, u);
  if (denied) return denied;
  try {
    return c.json(campaignToFrontend(await getTwenty<any>("agencyCampaigns", c.req.param("id"))));
  } catch (e: any) {
    return c.json({ error: "Campaign not found" }, 404);
  }
});

app.post("/api/campaigns", async (c) => {
  const u = await needAuth(c);
  const denied = requireAuthResult(c, u);
  if (denied) return denied;
  try {
    const { name, type, status, settings, utmSource, campaignType } = (await c.req.json().catch(() => ({}))) as any;
    const payload = {
      name: name || "New Campaign",
      status: status || "ACTIVE",
      campaignType: campaignType || mapCampaignType(utmSource || type || "outbound"),
      note: settings ? JSON.stringify(settings) : undefined,
    };
    const result = await createTwenty<any>("agencyCampaigns", payload);
    return c.json(campaignToFrontend((result as any).data || result), 201);
  } catch (e: any) {
    return err(c, e, "Failed to create campaign in Twenty");
  }
});

app.patch("/api/campaigns/:id", async (c) => {
  const u = await needAuth(c);
  const denied = requireAuthResult(c, u);
  if (denied) return denied;
  try {
    const { name, type, status, settings, utmSource, campaignType } = (await c.req.json().catch(() => ({}))) as any;
    const payload: any = {};
    if (name !== undefined) payload.name = name;
    if (status !== undefined) {
      const s = String(status).toUpperCase().replace("-", "_");
      payload.status = s === "PAUSED" ? "INACTIVE" : s === "ACTIVE" ? "ACTIVE" : "DRAFT";
    }
    if (campaignType !== undefined) payload.campaignType = String(campaignType).toUpperCase().replace("-", "_");
    else if (utmSource !== undefined || type !== undefined) payload.campaignType = mapCampaignType(utmSource || type);
    if (settings !== undefined) payload.note = JSON.stringify(settings);
    if (Object.keys(payload).length === 0) return c.json({ error: "No fields to update" }, 400);
    const result = await updateTwenty<any>("agencyCampaigns", c.req.param("id"), payload);
    return c.json(campaignToFrontend((result as any).data || result));
  } catch (e: any) {
    return err(c, e, "Failed to update campaign in Twenty");
  }
});

app.delete("/api/campaigns/:id", async (c) => {
  const u = await needAuth(c);
  const denied = requireAuthResult(c, u);
  if (denied) return denied;
  try {
    await deleteTwenty("agencyCampaigns", c.req.param("id"));
    return c.body(null, 204);
  } catch (e: any) {
    return err(c, e, "Failed to delete campaign from Twenty");
  }
});

// ---------- scripts ----------

app.get("/api/scripts", async (c) => {
  const u = await needAuth(c);
  const denied = requireAuthResult(c, u);
  if (denied) return denied;
  try {
    return c.json((await listTwenty<any>("agencyScripts", 100)).map(scriptToFrontend));
  } catch (e: any) {
    return err(c, e, "Failed to fetch scripts from Twenty");
  }
});

app.get("/api/scripts/:id", async (c) => {
  const u = await needAuth(c);
  const denied = requireAuthResult(c, u);
  if (denied) return denied;
  try {
    return c.json(scriptToFrontend(await getTwenty<any>("agencyScripts", c.req.param("id"))));
  } catch (e: any) {
    return c.json({ error: "Script not found" }, 404);
  }
});

app.post("/api/scripts", async (c) => {
  const u = await needAuth(c);
  const denied = requireAuthResult(c, u);
  if (denied) return denied;
  try {
    const { name, campaignId, scriptData } = (await c.req.json().catch(() => ({}))) as any;
    const payload: any = { name: name || "New Script", scriptData: scriptData ? JSON.stringify(scriptData) : undefined };
    if (campaignId) payload.campaignIdId = campaignId;
    const result = await createTwenty<any>("agencyScripts", payload);
    const s = (result as any).data || result;
    return c.json({ ...scriptToFrontend(s), name: s.name || "New Script" }, 201);
  } catch (e: any) {
    return err(c, e, "Failed to create script in Twenty");
  }
});

app.patch("/api/scripts/:id", async (c) => {
  const u = await needAuth(c);
  const denied = requireAuthResult(c, u);
  if (denied) return denied;
  try {
    const { name, campaignId, scriptData } = (await c.req.json().catch(() => ({}))) as any;
    const payload: any = {};
    if (name !== undefined) payload.name = name;
    if (campaignId !== undefined) payload.campaignIdId = campaignId ? campaignId : null;
    if (scriptData !== undefined) payload.scriptData = JSON.stringify(scriptData);
    if (Object.keys(payload).length === 0) return c.json({ error: "No fields to update" }, 400);
    const result = await updateTwenty<any>("agencyScripts", c.req.param("id"), payload);
    return c.json(scriptToFrontend((result as any).data || result));
  } catch (e: any) {
    return err(c, e, "Failed to update script in Twenty");
  }
});

app.delete("/api/scripts/:id", async (c) => {
  const u = await needAuth(c);
  const denied = requireAuthResult(c, u);
  if (denied) return denied;
  try {
    await deleteTwenty("agencyScripts", c.req.param("id"));
    return c.body(null, 204);
  } catch (e: any) {
    return err(c, e, "Failed to delete script from Twenty");
  }
});

// ---------- call logs (raw passthrough, no dialer auth — matches original) ----------

app.get("/api/call-logs", async (c) => {
  try {
    return c.json(await listTwenty<any>("agencyCallLogs"));
  } catch (e: any) {
    return err(c, e, "Failed to fetch call logs");
  }
});

app.get("/api/call-logs/lead/:leadId", async (c) => {
  try {
    return c.json(await listTwenty<any>("agencyCallLogs", {
      filter: JSON.stringify({ field: "leadId", operator: "eq", value: c.req.param("leadId") }),
    }));
  } catch (e: any) {
    return err(c, e, "Failed to fetch call logs");
  }
});

app.get("/api/call-logs/:id", async (c) => {
  try {
    return c.json(await getTwenty<any>("agencyCallLogs", c.req.param("id")));
  } catch (e: any) {
    return c.json({ error: "Call log not found" }, 404);
  }
});

app.post("/api/call-logs", async (c) => {
  try {
    const { lead_id, user_id, campaign_id, direction, outcome, duration_seconds, recording_url, transcript, notes, started_at, ended_at } =
      (await c.req.json().catch(() => ({}))) as any;
    const payload: any = {
      name: `${direction}: ${outcome}`, direction, outcome,
      durationSeconds: duration_seconds || 0, notes: notes || "",
    };
    if (lead_id) payload.leadId = lead_id;
    if (user_id) payload.userId = user_id;
    if (campaign_id) payload.campaignId = campaign_id;
    if (recording_url) payload.recordingUrl = recording_url;
    if (transcript) payload.transcript = transcript;
    if (started_at) payload.startedAt = started_at;
    if (ended_at) payload.endedAt = ended_at;
    const result = await createTwenty<any>("agencyCallLogs", payload);
    return c.json((result as any).data || result, 201);
  } catch (e: any) {
    return err(c, e, "Failed to create call log");
  }
});

// ---------- profiles (raw passthrough, no dialer auth — matches original) ----------

app.get("/api/profiles", async (c) => {
  try {
    return c.json(await listTwenty<any>("agencyProfiles"));
  } catch (e: any) {
    return err(c, e, "Failed to fetch profiles");
  }
});

app.get("/api/profiles/:id", async (c) => {
  try {
    return c.json(await getTwenty<any>("agencyProfiles", c.req.param("id")));
  } catch (e: any) {
    return c.json({ error: "Profile not found" }, 404);
  }
});

// ---------- twenty meta / phones ----------

app.get("/api/twenty/meta/:object", async (c) => {
  const u = await needAuth(c);
  const denied = requireAuthResult(c, u);
  if (denied) return denied;
  try {
    const objectName = c.req.param("object");
    const response = await fetchTwentyMeta<{ data: Array<{ id: string; name: string; label: string; type: string; nameSingular: string; namePlural: string; fields: Array<{ name: string; options?: Array<{ label: string; value: string; color: string }> }> }> }>("/metadata/objects");
    const allObjects = response.data || [];
    const target = allObjects.find((o) => o.nameSingular === objectName || o.namePlural === objectName);
    if (!target) return c.json({ error: `Object "${objectName}" not found` }, 404);
    const fieldOptions: Record<string, Array<{ label: string; value: string; color: string }>> = {};
    for (const field of target.fields || []) {
      if (field.options && field.options.length > 0) fieldOptions[field.name] = field.options;
    }
    return c.json({ object: { singular: target.nameSingular, plural: target.namePlural }, fields: fieldOptions });
  } catch (e: any) {
    return err(c, e, "Failed to fetch field metadata");
  }
});

app.get("/api/twenty/phones", async (c) => {
  const u = await needAuth(c);
  const denied = requireAuthResult(c, u);
  if (denied) return denied;
  try {
    const phones = await listTwenty<any>("agencyPhones", 100);
    return c.json(phones.map((p: any) => ({
      id: p.id,
      name: p.name,
      phoneNumber: p.phoneNumber || p.name,
      // Live Twenty shape (see SendWebsiteWidget_plan.md §1.4)
      countryCode: p.countryCode || null,
      numberType: p.numberType || null,
      state: p.state || null,
      messagingProfileId: p.messagingProfileId || null,
      tenDlcCampaignId: p.tenDlcCampaignId || null,
      tollFreeVerificationId: p.tollFreeVerificationId || null,
      lastSyncedAt: p.lastSyncedAt || null,
      eligibleProducts: p.eligibleProducts ?? null,
      features: p.features ?? null,
      health: p.health ?? null,
      // Claim state — single holder at a time (mirrors Express backend)
      callState: p.callState || "IDLE",
      claimedByMemberId: p.claimedByMemberId || null,
      claimedByEmail: p.claimedByEmail || null,
      claimedAt: p.claimedAt || null,
      currentCallId: p.currentCallId || null,
      // Back-compat aliases for existing UI (PhoneNumbersPage, widget selector)
      provider: p.numberType || "Unknown",
      city: "—",
      country: p.countryCode || "—",
      status: (p.state || "active").toLowerCase(),
      created_at: p.createdAt,
      updated_at: p.updatedAt,
    })));
  } catch (e: any) {
    return err(c, e, "Failed to fetch phone numbers");
  }
});

function mapAgencyCall(x: any) {
  return {
    id: x.id,
    name: x.name || null,
    direction: x.direction || null,
    status: x.status || null,
    fromNumber: x.fromNumber || null,
    toNumber: x.toNumber || null,
    startedAt: x.startedAt || null,
    endedAt: x.endedAt || null,
    durationSeconds: x.durationSeconds ?? 0,
    telnyxCallId: x.telnyxCallId || null,
    telnyxRecordingId: x.telnyxRecordingId || null,
    recordingUrl: x.recordingUrl || null,
    transcript: x.transcript || null,
    transcriptionStatus: x.transcriptionStatus || null,
    summary: x.summary || null,
    meetingUrl: x.meetingUrl || null,
    meetingProvider: x.meetingProvider || null,
    meetingAt: x.meetingAt || null,
    meetingStatus: x.meetingStatus || null,
    meetingBookingId: x.meetingBookingId || null,
    agencyPhoneId: x.agencyPhoneId || null,
    agencyProspectId: x.agencyProspectId || null,
    agencyLeadId: x.agencyLeadId || null,
    createdBy: x.createdBy ?? null,
    created_at: x.createdAt,
    updated_at: x.updatedAt,
  };
}

function mapAgencyPhoneClaim(p: any) {
  return {
    id: p.id,
    callState: p.callState || "IDLE",
    claimedByMemberId: p.claimedByMemberId || null,
    claimedByEmail: p.claimedByEmail || null,
    claimedAt: p.claimedAt || null,
    currentCallId: p.currentCallId || null,
  };
}

// Claim a number for the live call (409 when another member holds it)
app.post("/api/twenty/phones/:id/claim", async (c) => {
  const u = await needAuth(c);
  const denied = requireAuthResult(c, u);
  if (denied) return denied;
  try {
    const id = c.req.param("id");
    const { memberId, memberEmail } = (await c.req.json().catch(() => ({}))) as any;
    if (!memberId) return c.json({ error: "memberId is required" }, 400);
    const phone: any = await getTwenty<any>("agencyPhones", id);
    const state = phone.callState || "IDLE";
    const holder = phone.claimedByMemberId || null;
    if (state !== "IDLE" && holder && holder !== memberId) {
      return c.json({ error: "Number is in use", heldBy: phone.claimedByEmail || holder, callState: state, claimedAt: phone.claimedAt || null }, 409);
    }
    const now = new Date().toISOString();
    const updated: any = await updateTwenty<any>("agencyPhones", id, {
      callState: "DIALING", claimedByMemberId: memberId, claimedByEmail: memberEmail || "", claimedAt: now, lastSyncedAt: now,
    });
    return c.json(mapAgencyPhoneClaim(unwrapPhone(updated)));
  } catch (e: any) {
    return err(c, e, "Failed to claim number");
  }
});

function unwrapPhone(payload: any): any {
  const data = payload?.data?.data ?? payload?.data ?? payload;
  if (data && typeof data === "object") {
    for (const v of Object.values(data)) {
      if (v && typeof v === "object" && "id" in (v as object)) return v;
    }
    if ("id" in data) return data;
  }
  return data;
}

// Move the live call DIALING -> ACTIVE (holder only)
app.post("/api/twenty/phones/:id/state", async (c) => {
  const u = await needAuth(c);
  const denied = requireAuthResult(c, u);
  if (denied) return denied;
  try {
    const id = c.req.param("id");
    const { memberId, state } = (await c.req.json().catch(() => ({}))) as any;
    if (!memberId || (state !== "DIALING" && state !== "ACTIVE")) {
      return c.json({ error: "memberId and state (DIALING|ACTIVE) are required" }, 400);
    }
    const phone: any = await getTwenty<any>("agencyPhones", id);
    if ((phone.claimedByMemberId || null) !== memberId) {
      return c.json({ error: "Number is held by another member", heldBy: phone.claimedByEmail || phone.claimedByMemberId || null }, 409);
    }
    const updated: any = await updateTwenty<any>("agencyPhones", id, { callState: state, lastSyncedAt: new Date().toISOString() });
    return c.json(mapAgencyPhoneClaim(unwrapPhone(updated)));
  } catch (e: any) {
    return err(c, e, "Failed to set call state");
  }
});

// Release the number back to IDLE (holder only, unless force)
app.post("/api/twenty/phones/:id/release", async (c) => {
  const u = await needAuth(c);
  const denied = requireAuthResult(c, u);
  if (denied) return denied;
  try {
    const id = c.req.param("id");
    const { memberId, force, callId } = (await c.req.json().catch(() => ({}))) as any;
    if (!memberId) return c.json({ error: "memberId is required" }, 400);
    const phone: any = await getTwenty<any>("agencyPhones", id);
    const holder = phone.claimedByMemberId || null;
    if (holder && holder !== memberId && !force) {
      return c.json({ error: "Number is held by another member", heldBy: phone.claimedByEmail || holder }, 409);
    }
    const updated: any = await updateTwenty<any>("agencyPhones", id, {
      callState: "IDLE", claimedByMemberId: "", claimedByEmail: "",
      claimedAt: null, currentCallId: callId || phone.currentCallId || "",
      lastSyncedAt: new Date().toISOString(),
    });
    return c.json(mapAgencyPhoneClaim(unwrapPhone(updated)));
  } catch (e: any) {
    return err(c, e, "Failed to release number");
  }
});

// ---------- agencyCalls (mirrors Express backend) ----------

app.get("/api/calls", async (c) => {
  const u = await needAuth(c);
  const denied = requireAuthResult(c, u);
  if (denied) return denied;
  try {
    const all: any[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 50; page++) {
      const { records, pageInfo } = await listTwentyPage<any>("agencyCalls", { limit: 200, startingAfter: cursor });
      all.push(...records);
      if (!pageInfo.hasNextPage || !pageInfo.endCursor) break;
      cursor = pageInfo.endCursor;
    }
    return c.json(all.map(mapAgencyCall).reverse());
  } catch (e: any) {
    return err(c, e, "Failed to fetch calls");
  }
});

app.get("/api/calls/:id", async (c) => {
  const u = await needAuth(c);
  const denied = requireAuthResult(c, u);
  if (denied) return denied;
  try {
    return c.json(mapAgencyCall(await getTwenty<any>("agencyCalls", c.req.param("id"))));
  } catch (e: any) {
    return c.json({ error: "Call not found" }, 404);
  }
});

// Redirect to a fresh Telnyx mp3 (download URLs expire; the key stays server-side)
app.get("/api/calls/:id/audio", async (c) => {
  const u = await needAuth(c);
  const denied = requireAuthResult(c, u);
  if (denied) return denied;
  try {
    const call: any = await getTwenty<any>("agencyCalls", c.req.param("id"));
    if (!call?.telnyxRecordingId) return c.json({ error: "No Telnyx recording for this call yet" }, 404);
    const apiKey = (globalThis as any).process?.env?.TELNYX_API_KEY;
    if (!apiKey) return c.json({ error: "TELNYX_API_KEY not configured" }, 500);
    const r = await fetch(`https://api.telnyx.com/v2/recordings/${encodeURIComponent(call.telnyxRecordingId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!r.ok) return c.json({ error: "Telnyx recording lookup failed" }, 502);
    const j: any = await r.json();
    const url = j?.data?.download_urls?.mp3 || j?.data?.download_urls?.wav;
    if (!url) return c.json({ error: "Recording has no download URL yet" }, 404);
    return c.redirect(url, 302);
  } catch (e: any) {
    return err(c, e, "Failed to resolve call audio");
  }
});

app.post("/api/calls", async (c) => {
  const u = await needAuth(c);
  const denied = requireAuthResult(c, u);
  if (denied) return denied;
  try {
    const body = (await c.req.json().catch(() => ({}))) as any;
    const { direction, status, fromNumber, toNumber, startedAt, endedAt, durationSeconds,
      telnyxCallId, telnyxRecordingId, recordingUrl, transcript, transcriptionStatus, summary,
      agencyPhoneId, agencyProspectId, agencyLeadId } = body;
    if (!toNumber) return c.json({ error: "toNumber is required" }, 400);
    const payload: any = {
      name: `${direction || "OUTBOUND"} ${toNumber} ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
      direction: direction || "OUTBOUND", status: status || "COMPLETED",
      fromNumber: fromNumber || "", toNumber, durationSeconds: durationSeconds ?? 0,
    };
    if (startedAt) payload.startedAt = startedAt;
    if (endedAt) payload.endedAt = endedAt;
    if (telnyxCallId) payload.telnyxCallId = telnyxCallId;
    if (telnyxRecordingId) payload.telnyxRecordingId = telnyxRecordingId;
    if (recordingUrl) payload.recordingUrl = recordingUrl;
    if (transcript) payload.transcript = transcript;
    if (transcriptionStatus) payload.transcriptionStatus = transcriptionStatus;
    if (summary) payload.summary = summary;
    if (agencyPhoneId) payload.agencyPhoneId = agencyPhoneId;
    if (agencyProspectId) payload.agencyProspectId = agencyProspectId;
    if (agencyLeadId) payload.agencyLeadId = agencyLeadId;
    const created: any = await createTwenty<any>("agencyCalls", payload);
    const row = mapAgencyCall(unwrapPhone(created));
    if (agencyPhoneId) {
      try { await updateTwenty<any>("agencyPhones", agencyPhoneId, { currentCallId: row.id }); } catch {}
    }
    return c.json(row, 201);
  } catch (e: any) {
    return err(c, e, "Failed to log call");
  }
});

// Start Telnyx server-side recording (+transcription) for the live call.
// Plain SIP-trunked calls are NOT auto-recorded; without this there is no
// recording object and no call.recording.saved webhook afterwards.
app.post("/api/calls/:id/record", async (c) => {
  const u = await needAuth(c);
  const denied = requireAuthResult(c, u);
  if (denied) return denied;
  try {
    const call: any = await getTwenty<any>("agencyCalls", c.req.param("id"));
    if (!call?.telnyxCallId) return c.json({ error: "Call has no telnyxCallId yet (not answered?)" }, 400);
    const apiKey = (globalThis as any).process?.env?.TELNYX_API_KEY;
    if (!apiKey) return c.json({ error: "TELNYX_API_KEY not configured" }, 500);
    const r = await fetch(`https://api.telnyx.com/v2/calls/${encodeURIComponent(call.telnyxCallId)}/actions/record_start`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ format: "mp3", channels: "dual", transcription: true }),
    });
    const text = await r.text();
    if (!r.ok) return c.json({ error: "Telnyx record_start failed", details: text.slice(0, 200) }, 502);
    let recordingId: string | null = null;
    try {
      const j: any = JSON.parse(text);
      recordingId = j?.data?.recording_id || j?.data?.id || null;
    } catch { /* non-JSON; ignore */ }
    if (recordingId) {
      try { await updateTwenty<any>("agencyCalls", call.id, { telnyxRecordingId: recordingId, transcriptionStatus: "PENDING" }); } catch {}
    }
    return c.json({ ok: true, telnyxRecordingId: recordingId });
  } catch (e: any) {
    return err(c, e, "Failed to start server recording");
  }
});

// Telnyx-side fallback: match the call's recording by from/to + time window.
app.post("/api/calls/:id/reconcile", async (c) => {
  const u = await needAuth(c);
  const denied = requireAuthResult(c, u);
  if (denied) return denied;
  try {
    const call: any = await getTwenty<any>("agencyCalls", c.req.param("id"));
    if (call?.telnyxRecordingId) return c.json({ attached: true, already: true });
    const apiKey = (globalThis as any).process?.env?.TELNYX_API_KEY;
    if (!apiKey) return c.json({ error: "TELNYX_API_KEY not configured" }, 500);
    const since = new Date(new Date(call?.createdAt || Date.now()).getTime() - 15 * 60_000).toISOString();
    const params = new URLSearchParams({ "page[size]": "25", sort: "-created_at" });
    if (call?.fromNumber) params.set("filter[from]", call.fromNumber);
    if (call?.toNumber) params.set("filter[to]", call.toNumber);
    const r = await fetch(`https://api.telnyx.com/v2/recordings?${params.toString()}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!r.ok) return c.json({ error: "Telnyx recordings lookup failed" }, 502);
    const j: any = await r.json();
    const match = (j?.data || []).find((rec: any) =>
      rec?.status === "completed" && (!rec?.created_at || rec.created_at >= since));
    if (!match) return c.json({ attached: false });
    const patch: any = { telnyxRecordingId: match.id, transcriptionStatus: "PENDING" };
    if (match?.download_urls?.mp3) patch.recordingUrl = match.download_urls.mp3;
    else if (match?.download_urls?.wav) patch.recordingUrl = match.download_urls.wav;
    if (match?.call_control_id) patch.telnyxCallId = match.call_control_id;
    const updated = await updateTwenty<any>("agencyCalls", call.id, patch);
    return c.json({ attached: true, telnyxRecordingId: match.id, call: mapAgencyCall(unwrapPhone(updated)) });
  } catch (e: any) {
    return err(c, e, "Failed to reconcile recording");
  }
});

app.patch("/api/calls/:id", async (c) => {  const u = await needAuth(c);
  const denied = requireAuthResult(c, u);
  if (denied) return denied;
  try {
    const body = (await c.req.json().catch(() => ({}))) as any;
    const allowed = ["status", "endedAt", "durationSeconds", "telnyxCallId", "telnyxRecordingId", "recordingUrl",
      "transcript", "transcriptionStatus", "summary", "debugLog",
      "meetingUrl", "meetingProvider", "meetingAt", "meetingStatus", "meetingBookingId"];
    const patch: any = {};
    for (const key of allowed) if (body?.[key] !== undefined) patch[key] = body[key];
    if (Object.keys(patch).length === 0) return c.json({ error: "Nothing to update" }, 400);
    return c.json(mapAgencyCall(unwrapPhone(await updateTwenty<any>("agencyCalls", c.req.param("id"), patch))));
  } catch (e: any) {
    return err(c, e, "Failed to update call");
  }
});

// ---------- twenty setup ----------

app.post("/api/setup/twenty", async (c) => {
  const u = await needAuth(c);
  const denied = requireAuthResult(c, u);
  if (denied) return denied;
  try {
    const results = await setupTwentyCRM();
    return c.json({ success: true, message: "Twenty CRM setup completed", objects: results.objects, fields: results.fields });
  } catch (e: any) {
    return c.json({ success: false, error: "Setup failed", details: e?.message }, 500);
  }
});

app.get("/api/setup/twenty/status", async (c) => {
  const u = await needAuth(c);
  const denied = requireAuthResult(c, u);
  if (denied) return denied;
  return c.json({
    success: true,
    objects: [
      { name: "agencyProspects", exists: true, id: "placeholder" },
      { name: "agencyLeads", exists: true, id: "placeholder" },
      { name: "agencyCampaigns", exists: true, id: "placeholder" },
      { name: "agencyScripts", exists: true, id: "placeholder" },
    ],
    fields: [
      { object: "agencyProspects", name: "coldCallStatus", exists: true },
      { object: "agencyProspects", name: "utmSource", exists: true },
      { object: "agencyCampaigns", name: "status", exists: true },
      { object: "agencyCampaigns", name: "campaignType", exists: true },
    ],
  });
});

// ---------- call recordings (Railcode files) ----------

const MAX_RECORDING_BYTES = 50 * 1024 * 1024;

app.post("/api/calls/recording", async (c) => {
  const u = await needAuth(c);
  const denied = requireAuthResult(c, u);
  if (denied) return denied;
  try {
    const form = await c.req.formData();
    const file = form.get("recording");
    if (!file || typeof file === "string") return c.json({ error: "No recording file provided" }, 400);
    const contentType = file.type || "application/octet-stream";
    if (!contentType.startsWith("audio/")) return c.json({ error: "Only audio files are allowed" }, 400);
    const bytes = await file.arrayBuffer();
    if (bytes.byteLength > MAX_RECORDING_BYTES) return c.json({ error: "Recording exceeds 50MB limit" }, 400);
    const orig = file.name || "recording.webm";
    const ext = orig.includes(".") ? orig.slice(orig.lastIndexOf(".") + 1).replace(/[^A-Za-z0-9]/g, "") || "webm" : "webm";
    const filename = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    await files.put(`recordings/${filename}`, bytes, contentType);
    return c.json({ success: true, recordingUrl: `/api/calls/recordings/${filename}`, filename, size: bytes.byteLength });
  } catch (e: any) {
    return err(c, e, "Failed to upload recording");
  }
});

app.get("/api/calls/recordings/:filename", async (c) => {
  const u = await needAuth(c);
  const denied = requireAuthResult(c, u);
  if (denied) return denied;
  const filename = c.req.param("filename");
  if (!/^[A-Za-z0-9._-]+$/.test(filename)) return c.json({ error: "Recording not found" }, 404);
  const stored = await files.get(`recordings/${filename}`);
  if (!stored) return c.json({ error: "Recording not found" }, 404);
  return stored;
});

// Platform identity passthrough (handy for debugging; the dialer UI uses its own JWT).
app.get("/api/me", (c) => c.json({ user: ctx.user }));

export default app;
