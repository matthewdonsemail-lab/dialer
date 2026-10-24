import { Router } from "express";
import { authMiddleware, AuthRequest } from "../../middleware/auth.js";
import { listTwenty, listTwentyAll, createTwenty, updateTwenty, deleteTwenty, getTwenty, fetchTwenty } from "../../lib/twenty/client/index.js";
import { twentyGraphqlClient } from "../../lib/twenty/graphql/index.js";
import { contactTypes, idList } from "./helpers/query.js";
import { realText } from "./helpers/placeholders.js";
import { hasCompanyFilter, leadGqlQuery, pageWindow, personGqlQuery, prospectGqlQuery, type IdScope } from "./helpers/queryGql.js";
import { mapPersonListItem } from "./helpers/mapPersonRow.js";
import { lastCallIndex, NEVER_CALLED, outcomeCounts, sortByLastCall } from "../../lib/twenty/lastCall/index.js";
import { mapLeadToFrontend } from "../leads/helpers/index.js";
import { guardContactStatus } from "../../lib/pipelines/index.js";
import { checkSmsRoute, offerMachine, onPageSent, toE164 } from "@dialer/shared";
import { frameAllowed, framingHeaders, prospectPageUrl } from "../../lib/website/index.js";
import { createLogger } from "../../lib/logger/index.js";
import { resolveActor } from "../../lib/twenty/actor/index.js";
import { listWorkspaceMembers } from "../../lib/twenty/workspaceMember/index.js";
import type { AgencyProspect, AgencyCampaign, IndustryRouting } from "./types.js";
import {
  selectValue,
  slugifyIndustryValue,
  mapProspectListItem,
  mapProspectDetail,
  mapProspectUpdateResult,
  frontendStatusToTwenty,
  normalizeRequiredProspectFields,
} from "./helpers/index.js";

const router = Router();
router.use(authMiddleware);

const log = createLogger('prospects');

/**
 * Industry routing read from the agencyCampaign row — the only source of
 * urlKey/funnel/template bases. Linked campaign first, else the campaign
 * whose industryId matches the prospect label. Null = unconfigured
 * (callers surface explicit states, never invented defaults).
 *
 * Stays in the router: it performs Twenty I/O, and helpers are pure.
 */
async function resolveIndustryRouting(prospect: AgencyProspect): Promise<IndustryRouting | null> {
  const linked: any = (prospect as any).campaignId ?? (prospect as any).campaignIdId;
  const linkedId = typeof linked === "string" ? linked : linked?.id;
  if (linkedId) {
    try {
      const campaign: any = await getTwenty<any>('agencyCampaigns', linkedId);
      if (campaign?.urlKey) return campaign;
    } catch {
      // fall through to industryId filter
    }
  }
  const label = selectValue(prospect.label);
  if (!label) return null;
  try {
    const campaigns = await listTwenty<any>('agencyCampaigns', {
      limit: 1,
      filter: `industryId[eq]:${label}`,
    } as any);
    if (campaigns[0]?.urlKey) return campaigns[0];
  } catch (err: any) {
    log.info(`Campaign routing lookup failed: ${(err as any)?.message}`);
  }
  return null;
}

router.get("/", async (_req, res) => {
  try {
    log.info('Listing prospects from Twenty CRM');
    const prospects = await listTwentyAll<AgencyProspect>('agencyProspects');

    // Fetch campaigns to resolve campaign types
    let campaignMap: Record<string, string> = {};
    try {
      const campaigns = await listTwenty<AgencyCampaign>('agencyCampaigns', 100);
      campaignMap = Object.fromEntries(campaigns.map(c => [c.id, c.utmSource || 'outbound']));
    } catch {
      // Campaign lookup is best-effort; proceed without it
    }

    const mapped = prospects.map(mapProspectListItem);

    log.info(`Returning ${mapped.length} prospects`);
    res.json(mapped);
  } catch (err: any) {
    log.error("Failed to list prospects:", err.message);
    res.status(500).json({ error: "Failed to fetch prospects from Twenty", details: err.message });
  }
});

const PROSPECT_NODE = { __scalar: true, phoneNumber: { __scalar: true }, primaryPhone: { __scalar: true }, videoUrl: { __scalar: true } };
const LEAD_NODE = { __scalar: true, email: { __scalar: true }, phone: { __scalar: true } };
const PERSON_NODE = { __scalar: true, phones: { __scalar: true }, emails: { __scalar: true } };

type ContactObject = "agencyProspects" | "agencyLeads" | "agencyPeople";
type GqlQuery = { filter?: unknown; orderBy: unknown };
type ContactKind = "prospect" | "lead" | "person";

/** Most contacts "Select all" returns, and most the Last activity sort orders. */
const MAX_SELECT_ALL = 5000;
const MAX_ACTIVITY_SORT = 10000;

/**
 * Last call filter: the contacts whose newest call ended that way, or
 * (Never called) every contact without a call. "none" = nothing can match.
 */
async function resolveLastCallScope(params: Record<string, unknown>): Promise<IdScope | undefined | "none"> {
  const lastCall = typeof params.lastCall === "string" ? params.lastCall.trim() : "";
  if (!lastCall) return undefined;
  const index = await lastCallIndex();
  if (lastCall === NEVER_CALLED) return { notIn: [...index.keys()] };
  const ids = [...index.entries()].filter(([, outcome]) => outcome === lastCall).map(([id]) => id);
  return ids.length === 0 ? "none" : { in: ids };
}

/** The Twenty query per contact type for the table's search, filters and sort (null = type not shown). */
async function contactQueries(client: any, params: Record<string, unknown>, scope: IdScope | undefined) {
  const types = contactTypes(params.type);
  const pq = types.prospects ? prospectGqlQuery(params, scope) : null;
  const lq = types.leads ? leadGqlQuery(params, scope) : null;

  // People (decision makers): company filters (assignee, country, status, last call...) match through the
  // person's prospect, so first collect the prospects that pass them.
  let peq: ReturnType<typeof personGqlQuery> | null = null;
  if (types.people) {
    let prospectIds: string[] | undefined;
    if (hasCompanyFilter(params) || scope) {
      const companyQ = prospectGqlQuery(params, scope);
      prospectIds = [];
      let after: string | undefined;
      for (let page = 0; page < 25; page++) {
        const r: any = await client.query({
          agencyProspects: {
            __args: { first: 200, ...(after ? { after } : {}), ...(companyQ.filter ? { filter: companyQ.filter } : {}) },
            edges: { node: { id: true } },
            pageInfo: { hasNextPage: true, endCursor: true },
          },
        });
        prospectIds.push(...(r?.agencyProspects?.edges ?? []).map((e: any) => e.node.id as string));
        if (!r?.agencyProspects?.pageInfo?.hasNextPage) break;
        after = r.agencyProspects.pageInfo.endCursor;
      }
    }
    peq = prospectIds && prospectIds.length === 0 ? null : personGqlQuery(params, prospectIds);
  }
  return { pq, lq, peq };
}

/**
 * Every contact matching the queries (id, type, and a person's company), in the table's order, at most `cap`.
 * For Select all and the Last activity sort, which need more than the rows on screen.
 */
async function matchingContacts(client: any, qs: Awaited<ReturnType<typeof contactQueries>>, cap: number) {
  const sources: Array<{ object: ContactObject; type: ContactKind; q: GqlQuery; node: object } | null> = [
    qs.pq ? { object: "agencyProspects", type: "prospect", q: qs.pq, node: { id: true } } : null,
    qs.lq ? { object: "agencyLeads", type: "lead", q: qs.lq, node: { id: true } } : null,
    qs.peq ? { object: "agencyPeople", type: "person", q: qs.peq, node: { id: true, prospectId: true } } : null,
  ];
  const contacts: Array<{ id: string; type: ContactKind; prospectId?: string | null }> = [];
  let truncated = false;
  for (const src of sources) {
    if (!src) continue;
    for (let skip = 0; ; skip += 200) {
      if (contacts.length >= cap) {
        truncated = true;
        break;
      }
      let nodes: any[];
      try {
        const r: any = await client.query({
          [src.object]: { __args: { first: 200, offset: skip, orderBy: src.q.orderBy, ...(src.q.filter ? { filter: src.q.filter } : {}) }, edges: { node: src.node } },
        });
        nodes = (r?.[src.object]?.edges ?? []).map((e: any) => e.node);
      } catch (err: any) {
        // Leads are a bonus to the prospect list: if Twenty rejects the lead query, go on without them.
        if (src.type !== "lead") throw err;
        log.info(`Lead ids skipped: ${err.message}`);
        break;
      }
      for (const n of nodes) contacts.push({ id: n.id, type: src.type, ...(src.type === "person" ? { prospectId: n.prospectId ?? null } : {}) });
      if (nodes.length < 200) break;
    }
  }
  return { contacts: contacts.slice(0, cap), truncated };
}

/**
 * GET /api/prospects/page?offset=0&limit=50&q=&status=&country=&type=&sort=&dir=
 *
 * One window of contacts (prospects then leads, or leads first when the Type
 * column is sorted descending) with search, filters and sort applied by
 * Twenty, plus the total. Paged by offset through Twenty's GraphQL API, so the
 * table can fetch whatever slice is on screen, the way Twenty's own record
 * table virtualizes, instead of walking every page before it.
 */
router.get("/page", async (req, res) => {
  try {
    const params = req.query as Record<string, unknown>;
    const { offset, limit } = pageWindow(params);
    const client: any = twentyGraphqlClient();

    const resolved = await resolveLastCallScope(params);
    if (resolved === "none") return res.json({ offset, rows: [], totalCount: 0, counts: { prospect: 0, lead: 0, person: 0 } });
    const scope = resolved;
    const { pq, lq, peq } = await contactQueries(client, params, scope);

    const fetchSlice = async (object: ContactObject, q: GqlQuery, node: object, first: number, skip: number) => {
      const r: any = await client.query({
        [object]: { __args: { first: Math.max(1, first), offset: skip, orderBy: q.orderBy, ...(q.filter ? { filter: q.filter } : {}) }, totalCount: true, edges: { node } },
      });
      return { rows: (r?.[object]?.edges ?? []).map((e: any) => e.node), total: r?.[object]?.totalCount ?? 0 };
    };

    let rows: any[] = [];
    let pTotal = 0;
    let lTotal = 0;
    let peTotal = 0;
    if (params.sort === "last_activity") {
      // Twenty cannot sort by a call's time (calls are another object), so order every matching contact by the
      // call index (newest call first). A person's calls are logged on their company. Never called come last.
      const [{ contacts }, index] = await Promise.all([matchingContacts(client, { pq, lq, peq }, MAX_ACTIVITY_SORT), lastCallIndex()]);
      const ordered = sortByLastCall(contacts, (c) => (c.type === "person" ? c.prospectId : c.id), [...index.keys()], params.dir === "asc" ? "asc" : "desc");
      for (const c of contacts) {
        if (c.type === "prospect") pTotal++;
        else if (c.type === "lead") lTotal++;
        else peTotal++;
      }
      const window = ordered.slice(offset, offset + limit);
      const byType = (t: ContactKind) => window.filter((c) => c.type === t).map((c) => c.id);
      const fetchByIds = async (object: ContactObject, ids: string[], node: object, map: (r: any) => any, type: ContactKind) => {
        if (!ids.length) return [];
        const slice = await fetchSlice(object, { orderBy: [{ id: "AscNullsFirst" }], filter: { id: { in: ids } } }, node, ids.length, 0);
        return slice.rows.map((r: any) => ({ ...map(r), type }));
      };
      const found = (
        await Promise.all([
          fetchByIds("agencyProspects", byType("prospect"), PROSPECT_NODE, mapProspectListItem, "prospect"),
          fetchByIds("agencyLeads", byType("lead"), LEAD_NODE, (r) => mapLeadToFrontend(r), "lead").catch(() => []),
          fetchByIds("agencyPeople", byType("person"), PERSON_NODE, mapPersonListItem, "person"),
        ])
      ).flat();
      const position = new Map(window.map((c, i) => [c.id, i]));
      rows = found.sort((a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0));
    } else {
      // Totals first (1-row queries), so the table can size its scroll area.
      [pTotal, lTotal, peTotal] = await Promise.all([
        pq ? fetchSlice("agencyProspects", pq, { id: true }, 1, 0).then((r) => r.total) : Promise.resolve(0),
        // Leads are a bonus to the prospect list: if Twenty rejects the lead query, show prospects alone.
        lq
          ? fetchSlice("agencyLeads", lq, { id: true }, 1, 0)
              .then((r) => r.total)
              .catch((err) => {
                log.info(`Lead query skipped: ${err.message}`);
                return 0;
              })
          : Promise.resolve(0),
        peq ? fetchSlice("agencyPeople", peq, { id: true }, 1, 0).then((r) => r.total) : Promise.resolve(0),
      ]);

      const sources = [
        pq && pTotal > 0 ? { object: "agencyProspects" as const, q: pq, node: PROSPECT_NODE, total: pTotal, type: "prospect", map: mapProspectListItem } : null,
        lq && lTotal > 0 ? { object: "agencyLeads" as const, q: lq, node: LEAD_NODE, total: lTotal, type: "lead", map: (r: any) => mapLeadToFrontend(r) } : null,
        peq && peTotal > 0 ? { object: "agencyPeople" as const, q: peq, node: PERSON_NODE, total: peTotal, type: "person", map: mapPersonListItem } : null,
      ].filter((x): x is NonNullable<typeof x> => !!x);
      if (params.sort === "contact_type" && params.dir === "desc") sources.reverse();

      // Walk the window [offset, offset + limit) across the sources in order.
      let skip = offset;
      for (const src of sources) {
        if (rows.length >= limit) break;
        if (skip >= src.total) {
          skip -= src.total;
          continue;
        }
        const slice = await fetchSlice(src.object, src.q, src.node, limit - rows.length, skip);
        rows = rows.concat(slice.rows.map((r: any) => ({ ...src.map(r), type: src.type })));
        skip = 0;
      }
    }

    // A person shows their company: its name, place, status, assignee and campaign (one request for the window).
    const companyOf = new Map<string, any>();
    const personCompanies = [...new Set(rows.filter((r) => r.type === "person" && r.prospectId).map((r) => r.prospectId as string))];
    if (personCompanies.length) {
      try {
        const r: any = await client.query({
          agencyProspects: { __args: { first: personCompanies.length, filter: { id: { in: personCompanies } } }, edges: { node: PROSPECT_NODE } },
        });
        for (const e of r?.agencyProspects?.edges ?? []) companyOf.set(e.node.id, mapProspectListItem(e.node));
      } catch (err: any) {
        log.info(`Company lookup for people skipped: ${err.message}`);
      }
      rows = rows.map((r) => {
        const c = r.type === "person" ? companyOf.get(r.prospectId) : null;
        if (!c) return r;
        const company = [c.first_name, c.last_name].filter(Boolean).join(" ");
        return { ...r, company: company || r.company, niche: c.niche, country: c.country, state: c.state, city: c.city, status: c.status, assignedToId: c.assignedToId ?? null, campaign_id: c.campaign_id ?? null };
      });
    }

    // Last call per contact in this window: one request, not per row. A person's calls are logged on their company.
    const prospectIds = [...new Set([...rows.filter((r) => r.type === "prospect").map((r) => r.id), ...personCompanies])];
    const leadIds = rows.filter((r) => r.type === "lead").map((r) => r.id);
    const last = new Map<string, { id: string; status: string | null; at: string | null }>();
    const clauses = [
      prospectIds.length ? `agencyProspectId[in]:[${prospectIds.join(",")}]` : null,
      leadIds.length ? `agencyLeadId[in]:[${leadIds.join(",")}]` : null,
    ].filter(Boolean) as string[];
    if (clauses.length) {
      try {
        const calls: any = await fetchTwenty("agencyCalls", {
          limit: 200,
          query: { filter: clauses.length > 1 ? `or(${clauses.join(",")})` : clauses[0], order_by: "createdAt[DescNullsLast]" },
        });
        for (const c of calls?.data?.agencyCalls ?? []) {
          const owner = c.agencyProspectId || c.agencyLeadId;
          if (owner && !last.has(owner)) last.set(owner, { id: c.id, status: c.disposition || c.status || null, at: c.startedAt ?? c.createdAt ?? null });
        }
      } catch (err: any) {
        log.info(`Last-call lookup skipped: ${err.message}`);
      }
    }

    res.json({
      offset,
      rows: rows.map((r) => ({ ...r, lastCall: last.get(r.type === "person" ? r.prospectId : r.id) ?? null })),
      totalCount: pTotal + lTotal + peTotal,
      counts: { prospect: pTotal, lead: lTotal, person: peTotal },
    });
  } catch (err: any) {
    log.error("Failed to page contacts:", err.message);
    res.status(500).json({ error: "Failed to fetch contacts from Twenty", details: err.message });
  }
});

/**
 * GET /api/prospects/ids?<same filters as /page>
 *
 * The id and type of EVERY contact matching the filters (not just the rows
 * on screen), so "Select all" can reach contacts on other pages. Capped at
 * MAX_SELECT_ALL; `truncated` says so.
 */
router.get("/ids", async (req, res) => {
  try {
    const params = req.query as Record<string, unknown>;
    const resolved = await resolveLastCallScope(params);
    if (resolved === "none") return res.json({ ids: [], truncated: false });
    const client: any = twentyGraphqlClient();
    const { contacts, truncated } = await matchingContacts(client, await contactQueries(client, params, resolved), MAX_SELECT_ALL);
    // A person carries their company: campaigns dial the company.
    res.json({ ids: contacts, truncated });
  } catch (err: any) {
    log.error("Failed to list contact ids:", err.message);
    res.status(500).json({ error: "Failed to list contacts from Twenty", details: err.message });
  }
});

/**
 * GET /api/prospects/facets — how many contacts have each status, country,
 * industry and campaign, counted by Twenty (groupBy), so filter menus show
 * counts without the browser loading the records.
 */
router.get("/facets", async (_req, res) => {
  try {
    const client: any = twentyGraphqlClient();
    const group = async (field: string) => {
      const r: any = await client.query({
        agencyProspectsGroupBy: { __args: { groupBy: [{ [field]: true }], limit: 500 }, groupByDimensionValues: true, totalCount: true },
      });
      const out: Record<string, number> = {};
      for (const g of r?.agencyProspectsGroupBy ?? []) {
        const key = g?.groupByDimensionValues?.[0];
        // Import placeholders ("unknown") are not a value anyone filters by: leave them out of the menus.
        if (typeof key === "string" && key !== "" && realText(key) === undefined) continue;
        out[key === null || key === undefined || key === "" ? "__blank" : String(key)] = g.totalCount ?? 0;
      }
      return out;
    };
    const none = () => ({}) as Record<string, number>;
    const [status, country, industry, campaign, creators, state, city, assignedTo, leadSource, offer, memberNames, campaignNames, last] = await Promise.all([
      group("coldCallStatus"),
      group("country"),
      group("niche"),
      group("campaignIdId"),
      group("createdByMemberId").catch(none),
      group("region").catch(none),
      group("city").catch(none),
      // Workspaces without these fields (bun run twenty:schema adds them) just get no counts.
      group("assignedToId").catch(none),
      group("leadSource").catch(none),
      group("offer").catch(none),
      // Names for the id-valued menus (Assigned to, Campaign).
      listWorkspaceMembers()
        .then((ms) => Object.fromEntries(ms.map((m) => [m.id, [m.firstName, m.lastName].filter(Boolean).join(" ").trim() || m.userEmail || m.id])))
        .catch(() => ({}) as Record<string, string>),
      listTwenty<AgencyCampaign>("agencyCampaigns", 200)
        .then((cs) => Object.fromEntries(cs.map((c: any) => [c.id, String(c.name ?? c.id)])))
        .catch(() => ({}) as Record<string, string>),
      // A failed call walk only loses the Last call counts, not the other filters.
      lastCallIndex().catch((err) => {
        log.info(`Last-call counts skipped: ${err.message}`);
        return null;
      }),
    ]);
    const creator = Object.entries(creators).reduce((sum, [k, n]) => (k === "__blank" ? sum : sum + n), 0);
    const total = Object.values(country).reduce((a, b) => a + b, 0);
    const leadsBody: any = await fetchTwenty("agencyLeads", { limit: 1 });
    // People are opt-in in the table (Type -> People), so they count in the Type menu but not in the total.
    const peopleBody: any = await fetchTwenty("agencyPeople", { limit: 1 }).catch(() => null);
    const people = typeof peopleBody?.totalCount === "number" ? peopleBody.totalCount : 0;
    const leads = typeof leadsBody?.totalCount === "number" ? leadsBody.totalCount : 0;
    const lastCall = last ? { ...outcomeCounts(last), [NEVER_CALLED]: Math.max(0, total + leads - last.size) } : {};
    res.json({
      total: total + leads,
      type: { prospect: total, lead: leads, person: people },
      status,
      country,
      industry,
      campaign,
      creator,
      state,
      city,
      lastCall,
      assignedTo,
      leadSource,
      offer,
      names: { member: memberNames, campaign: campaignNames },
    });
  } catch (err: any) {
    log.error("Failed to count prospect facets:", err.message);
    res.status(500).json({ error: "Failed to count contacts in Twenty", details: err.message });
  }
});

/**
 * GET /api/prospects/lookup?ids=a,b — just the contacts a page needs (names
 * for call history, a campaign's numbers), prospects or leads, at most 200
 * ids per request.
 */
router.get("/lookup", async (req, res) => {
  try {
    const ids = idList(req.query.ids);
    if (ids.length === 0) return res.json([]);
    // An id may be a prospect or a lead (calls point at either); ask both.
    const filter = `id[in]:[${ids.join(",")}]`;
    const [prospects, leads]: any[] = await Promise.all([
      fetchTwenty("agencyProspects", { limit: 200, query: { filter } }),
      fetchTwenty("agencyLeads", { limit: 200, query: { filter } }).catch(() => null),
    ]);
    res.json([
      ...((prospects?.data?.agencyProspects ?? []) as AgencyProspect[]).map((r) => ({ ...mapProspectListItem(r), type: "prospect" })),
      ...((leads?.data?.agencyLeads ?? []) as any[]).map((r) => ({ ...mapLeadToFrontend(r), type: "lead" })),
    ]);
  } catch (err: any) {
    log.error("Failed to look up prospects:", err.message);
    res.status(500).json({ error: "Failed to fetch contacts from Twenty", details: err.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    log.info(`Getting prospect ${req.params.id}`);
    const id = req.params.id as string;
    const prospect = await getTwenty<AgencyProspect>('agencyProspects', id);

    const mapped = mapProspectDetail(prospect);

    res.json(mapped);
  } catch (err: any) {
    log.error(`Failed to get prospect ${req.params.id}:`, err.message);
    res.status(404).json({ error: "Prospect not found" });
  }
});

router.post("/", async (req: AuthRequest, res) => {
  try {
    const {
      first_name, last_name, phone, email, website,
      address, city, state, zip, status, source, tags, notes, dnc,
    } = req.body;

    const fullName = [first_name, last_name].filter(Boolean).join(" ").trim();
    const fullAddress = [address, city, state, zip].filter(Boolean).join(", ");

    // Map our status to Twenty's coldCallStatus
    const coldCallStatus = frontendStatusToTwenty(status, dnc);

    log.info(`Creating prospect: ${fullName}`);

    // agencyProspect is shared with the offer funnel, whose NOT NULL contract
    // (website, geo, niche, label, slug) the manual-entry form cannot always
    // satisfy. Normalize rather than relax the object, so the funnel's
    // workflows keep working.
    const normalized = normalizeRequiredProspectFields({
      name: fullName,
      phone,
      email,
      website,
      fullAddress,
      city,
      region: state,
      source,
      now: Date.now(),
    });
    if (normalized.missing.length > 0) {
      res.status(400).json({
        error:
          normalized.missing.includes("phone")
            ? "A prospect needs a phone number - there is nothing to call without one."
            : "A prospect needs a city - the campaign routes on geography.",
        missing: normalized.missing,
      });
      return;
    }

    const payload = {
      ...normalized.payload,
      rating: 0,
      reviewCount: 0,
      externalId: undefined,
      outboundState: tags?.[0],
      coldCallStatus,
      ...(notes ? { notes } : {}),
      // Own-field member attribution (omitted for legacy/fallback sessions).
      ...(req.workspaceMemberId ? { createdByMemberId: req.workspaceMemberId } : {}),
    };

    const result = await createTwenty<any>('agencyProspects', payload, await resolveActor(req));
    const prospect = result.data || result;

    const mapped = {
      id: prospect.id,
      first_name,
      last_name,
      phone,
      email,
      website,
      address,
      city,
      state,
      zip,
      status: coldCallStatus === "DO_NOT_CONTACT" ? "do_not_contact" : "new",
      source,
      tags: tags || null,
      notes: notes,
      dnc: Boolean(dnc),
      sync_id: prospect.externalId,
      created_at: prospect.createdAt || new Date().toISOString(),
      updated_at: prospect.updatedAt || new Date().toISOString(),
    };

    log.info(`Created prospect ${prospect.id}`);
    res.status(201).json(mapped);
  } catch (err: any) {
    // website and slug carry UNIQUE indexes, so re-adding a business the funnel
    // already knows about is a real outcome, not a server fault.
    if (/duplicate entry|unique constraint/i.test(String(err?.message || ""))) {
      log.info(`Prospect create rejected as duplicate: ${err.message}`);
      res.status(409).json({
        error: "A prospect with that website already exists.",
        conflict: "website",
      });
      return;
    }
    log.error("Failed to create prospect:", err.message);
    res.status(500).json({ error: "Failed to create prospect in Twenty", details: err.message });
  }
});

router.patch("/:id", async (req: AuthRequest, res) => {
  try {
    log.info(`Updating prospect ${req.params.id}`);

    const {
      first_name, last_name, phone, email, website,
      address, city, state, zip, status, source, tags, notes, dnc,
      campaign_id,
    } = req.body;

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
    if (notes !== undefined) payload.notes = notes || null;
    if (tags?.[0] !== undefined) payload.outboundState = tags[0];

    // Handle campaign relation
    if (campaign_id !== undefined) {
      payload.campaignIdId = campaign_id || null;
    }

    if (req.body.assignedToId !== undefined) {
      payload.assignedToId = req.body.assignedToId || null;
    }

    // Status changes follow the contact pipeline (packages/shared
    // contact-status): a move it does not allow is refused with the reason.
    if (status !== undefined || dnc) {
      const guard = await guardContactStatus("agencyProspects", req.params.id as string, status, { dnc, reopen: req.body?.reopen === true });
      if (!guard.ok) {
        res.status(guard.status).json({ error: guard.reason, code: "INVALID_TRANSITION" });
        return;
      }
      payload.coldCallStatus = guard.to;
    }

    if (Object.keys(payload).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    const id = req.params.id as string;
    const result = await updateTwenty<any>('agencyProspects', id, payload, await resolveActor(req));
    const prospect = result.data || result;

    const mapped = mapProspectUpdateResult(prospect);

    log.info(`Updated prospect ${prospect.id}`);
    res.json(mapped);
  } catch (err: any) {
    log.error(`Failed to update prospect ${req.params.id}:`, err.message);
    res.status(500).json({ error: "Failed to update prospect in Twenty", details: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    log.info(`Deleting prospect ${req.params.id}`);
    const id = req.params.id as string;

    await deleteTwenty('agencyProspects', id);

    log.info(`Deleted prospect ${id}`);
    res.status(204).end();
  } catch (err: any) {
    log.error(`Failed to delete prospect ${req.params.id}:`, err.message);
    res.status(500).json({ error: "Failed to delete prospect from Twenty", details: err.message });
  }
});

/**
 * GET /api/prospects/:id/website-status
 * Server-side aggregation for SendWebsiteWidget (Twenty key never leaves backend):
 * prospect messaging/video block + INDUSTRY agencyOffer + computed template/offer URLs.
 * Offer is industry-only (name == INDUSTRY:{urlKey}); industry routing (urlKey,
 * funnel/template bases, pack) is read from the agencyCampaign row — never
 * hardcoded, never defaulted. Missing rows surface as explicit nulls.
 */
router.get("/:id/website-status", async (req, res) => {
  try {
    const id = req.params.id as string;
    const prospect = await getTwenty<AgencyProspect>('agencyProspects', id);

    // Industry routing from the campaign row: linked campaign first, else the
    // campaign whose industryId matches the prospect label.
    const routing = await resolveIndustryRouting(prospect);
    const industryKey = routing?.urlKey || null;
    const funnelBase = (routing?.funnelBaseUrl || "").replace(/\/$/, "");
    const templateBase = (routing?.templateBaseUrl || "").replace(/\/$/, "");
    const pack = routing?.packDir || null;

    // Offer lookup: the INDUSTRY row, never the per-prospect row.
    let offer: any = null;
    if (industryKey) {
      try {
        const offers = await listTwenty<any>('agencyOffers', {
          limit: 1,
          filter: `name[eq]:INDUSTRY:${industryKey}`,
        } as any);
        offer = offers[0] ?? null;
      } catch (err: any) {
        log.info(`No industry offer INDUSTRY:${industryKey} for prospect ${id}: ${err.message}`);
      }
    }

    // Effective video: industry CUSTOM override wins, else the prospect video.
    const prospectVideoUrl =
      typeof prospect.videoUrl === "string"
        ? prospect.videoUrl
        : (prospect.videoUrl as any)?.primaryLinkUrl || undefined;
    const offerMode = String(offer?.videoMode || "PROSPECT").toUpperCase();
    const overrideUrl =
      typeof offer?.videoUrl === "string"
        ? offer.videoUrl
        : offer?.videoUrl?.primaryLinkUrl || undefined;
    const effectiveVideoUrl =
      offerMode === "CUSTOM" && overrideUrl ? overrideUrl : prospectVideoUrl;

    // Canonical phone: PHONES composite first, legacy TEXT fallback.
    const phoneE164 = toE164(prospect.phoneNumber as any) || toE164(prospect.primaryPhone as any) || toE164(prospect.phone) || prospect.phone;

    // Absolute "website we built" URL: phi /offer/:industry/:slug lineup
    // (same slug as the funnel). Null when unconfigured — never invented.
    // No trailing slash (the Vercel rewrites match slash-less paths).
    const niche = prospect.niche || "";
    const labelValue = selectValue(prospect.label) || (niche ? slugifyIndustryValue(niche) : "UNLABELED");
    const slug = prospect.slug || "";
    const prospectId = prospect.id;
    const templateKey = slug || prospectId;
    const templateUrl = industryKey && templateBase ? `${templateBase}/offer/${industryKey}/${templateKey}` : null;
    const funnelSrc = funnelBase ? `${funnelBase}/offer/prospect/${prospectId}` : null;

    // The one page we send: on the offer site, previewable only when the
    // offer site's frame-ancestors lists the dialer's origin.
    const pageUrl = prospectPageUrl(prospectId);
    const origin = typeof req.query.origin === "string" ? req.query.origin : "";
    const framing = origin ? await framingHeaders(pageUrl) : null;
    const previewAllowed = framing ? frameAllowed(framing, origin) : false;

    res.json({
      page: {
        url: pageUrl,
        previewAllowed,
        previewBlockedReason: previewAllowed
          ? null
          : framing
            ? `${new URL(pageUrl).host} does not allow ${origin ? new URL(origin).host : "this app"} to embed it (Content-Security-Policy frame-ancestors).`
            : "The offer site could not be reached to check embedding.",
      },
      prospect: {
        id: prospectId,
        slug,
        niche,
        label: selectValue(prospect.label),
        labelValue,
        website: prospect.website,
        phone: prospect.phone,
        phoneE164,
        country: prospect.country,
        city: prospect.city,
        region: prospect.region,
        videoStatus: selectValue(prospect.videoStatus),
        videoSource: prospect.videoSource,
        videoError: prospect.videoError,
        videoUrl: prospect.videoUrl ?? null,
        outboundState: selectValue(prospect.outboundState),
        outboundLabel: selectValue(prospect.outboundLabel),
        smsMetadata: prospect.smsMetadata ?? null,
        whatsappStatus: selectValue(prospect.whatsappStatus),
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
        // Cosmetic display URL (industry + slug); the funnel resolves by prospect ID
        offerDisplayUrl: industryKey && slug ? `/offer/${industryKey}/${slug}` : null,
        funnelSrc,
        templateUrl,
        templateAvailable: templateUrl !== null,
      },
    });
  } catch (err: any) {
    log.error(`Failed to get website-status for ${req.params.id}:`, err.message);
    res.status(404).json({ error: "Prospect not found" });
  }
});

/**
 * POST /api/prospects/:id/website-sent
 * Logs that the prospect's page was sent. The outreach pipeline decides the
 * new outboundLabel (packages/shared onPageSent); refuses opted-out prospects
 * (409) and cross-country sends (422, checkSmsRoute).
 */
router.post("/:id/website-sent", async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const { templateUrl, offerUrl, fromNumber, body } = req.body ?? {};
    const sentAt = new Date().toISOString();
    const current = await getTwenty<AgencyProspect>('agencyProspects', id);

    // Same rules as the SPA (packages/shared outreach): an opted-out prospect
    // gets nothing, and a number only texts its own country.
    const event = onPageSent(selectValue(current.outboundLabel));
    if (!event.ok) {
      res.status(409).json({ error: event.reason, code: "INVALID_TRANSITION" });
      return;
    }
    const toNumber = toE164(current.phoneNumber as any) || toE164(current.primaryPhone as any) || toE164(current.phone) || "";
    if (fromNumber) {
      const route = checkSmsRoute({ number: fromNumber }, { number: toNumber, country: current.country });
      if (!route.ok) {
        res.status(422).json({ error: route.reason, code: "SMS_ROUTE_BLOCKED" });
        return;
      }
    }

    let advancedLabel: string | null = null;
    if (event.changed) {
      await updateTwenty('agencyProspects', id, { outboundLabel: event.to }, await resolveActor(req));
      advancedLabel = event.to;
    }

    log.info(`Website sent logged for prospect ${id} from ${fromNumber || "unknown"}`);
    res.json({
      success: true,
      prospectId: id,
      sentAt,
      templateUrl: templateUrl ?? null,
      offerUrl: offerUrl ?? null,
      fromNumber: fromNumber ?? null,
      bodyPreview: typeof body === "string" ? body.slice(0, 280) : null,
      outboundLabel: advancedLabel,
    });
  } catch (err: any) {
    log.error(`Failed to log website-sent for ${req.params.id}:`, err.message);
    res.status(500).json({ error: "Failed to log website sent", details: err.message });
  }
});

/**
 * POST /api/prospects/:id/ensure-offer
 * Resolves the funnel 404 at the industry level: returns the INDUSTRY:{id}
 * offer for the prospect's industry, or creates it (neutral copy, ACTIVE,
 * videoMode=PROSPECT) so /offer/:industry/:slug + funnel links work immediately.
 * Per-prospect rows are never created here.
 */
router.post("/:id/ensure-offer", async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const prospect = await getTwenty<AgencyProspect>('agencyProspects', id);
    const routing = await resolveIndustryRouting(prospect);
    if (!routing?.urlKey) {
      res.status(404).json({ error: "Industry not configured for prospect" });
      return;
    }
    const industryKey = routing.urlKey;
    const twentyValue = selectValue((routing as any).industryId) || selectValue(prospect.label) || "";
    const rowName = `INDUSTRY:${industryKey}`;

    const existing = await listTwenty<any>('agencyOffers', {
      limit: 1,
      filter: `name[eq]:${rowName}`,
    } as any);
    if (existing[0]) {
      res.json({ action: "existing" as const, industryKey, offer: existing[0] });
      return;
    }

    // Neutral seed copy only — the operator tailors it in the builder.
    const created = await createTwenty<any>('agencyOffers', {
      name: rowName,
      title: `Free Consultation`,
      heroH1: `Book Your Free Consultation`,
      heroLede: {
        blocknote: null,
        markdown: `Answer a few quick questions and book your free consultation call.`,
      },
      status: offerMachine.state("ACTIVE"),
      industryId: twentyValue || undefined,
      videoMode: "PROSPECT",
    });
    const offer = (created as any).data || created;
    log.info(`Created industry offer ${rowName} (${offer.id}) via prospect ${id}`);
    res.status(201).json({ action: "created" as const, industryKey, offer });
  } catch (err: any) {
    log.error(`Failed to ensure offer for ${req.params.id}:`, err.message);
    res.status(500).json({ error: "Failed to ensure offer", details: err.message });
  }
});

export default router;
