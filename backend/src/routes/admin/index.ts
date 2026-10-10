import { Router } from "express";
import { loadContact, messagesFor } from "../messages/thread.js";
import { authMiddleware } from "../../middleware/auth.js";
import { fetchTwenty } from "../../lib/twenty/client/index.js";
import { listWorkspaceMembers } from "../../lib/twenty/workspaceMember/index.js";
import { createLogger } from "../../lib/logger/index.js";
import { DIALER_TARGET_FILTER, mapActivity, recordTargetFilter } from "./helpers/index.js";
import type { AdminActivity, AdminActivityResponse } from "./types.js";

const router = Router();
router.use(authMiddleware);

const log = createLogger("admin");

const PAGE_SIZE = 200;
/** Hard cap so a wide range cannot fan out into dozens of Twenty requests. */
const MAX_PAGES = 15;
const DEFAULT_RANGE_MS = 7 * 24 * 3600 * 1000;

/**
 * GET /api/admin/activity?since=<ISO>
 * GET /api/admin/activity?targets=call:<id>,prospect:<id>
 *
 * Read-only feed of create / update / delete events on dialer records, from
 * Twenty's timelineActivities, newest first. With `since` (default 7 days)
 * it covers every dialer object; with `targets` it returns the full history
 * of those records (e.g. one call and its contact). Also returns workspace
 * member names so the page can attribute records to the people who created
 * them.
 */
/**
 * Everything that happened to a contact: its own record, every call to it
 * and every text to or from its numbers. Resolved here so the browser asks
 * once; Twenty is filtered by the timeline target columns.
 */
async function contactTargetFilter(contact: string): Promise<string | null> {
  const [type, id] = contact.split(":");
  if ((type !== "prospect" && type !== "lead") || !/^[0-9a-f-]{36}$/i.test(id ?? "")) return null;
  const callColumn = type === "lead" ? "agencyLeadId" : "agencyProspectId";
  const [calls, texts] = await Promise.all([
    fetchTwenty<any>("agencyCalls", { limit: 60, query: { filter: `${callColumn}[eq]:"${id}"`, order_by: "createdAt[DescNullsLast]" } })
      .then((b) => (b?.data?.agencyCalls ?? []).map((c: any) => c.id as string))
      .catch(() => [] as string[]),
    loadContact(type, id)
      .then(({ numbers }) => messagesFor(numbers))
      .then((rows) => rows.slice(0, 60).map((m) => m.id))
      .catch(() => [] as string[]),
  ]);
  const clauses = [`${type === "lead" ? "targetAgencyLeadId" : "targetAgencyProspectId"}[eq]:"${id}"`];
  if (calls.length) clauses.push(`targetAgencyCallId[in]:[${calls.join(",")}]`);
  if (texts.length) clauses.push(`targetAgencyMessageId[in]:[${texts.join(",")}]`);
  return clauses.length > 1 ? `or(${clauses.join(",")})` : clauses[0];
}

router.get("/activity", async (req, res) => {
  try {
    const sinceParam = typeof req.query.since === "string" ? Date.parse(req.query.since) : NaN;
    const targets = typeof req.query.targets === "string" ? req.query.targets : "";
    const contact = typeof req.query.contact === "string" ? req.query.contact : "";
    const targetFilter = contact ? await contactTargetFilter(contact) : targets ? recordTargetFilter(targets) : null;
    if (contact && !targetFilter) return res.status(400).json({ error: "contact must be prospect:<uuid> or lead:<uuid>" });
    if (targets && !targetFilter) return res.status(400).json({ error: "targets must be object:uuid pairs" });
    // A record's history has no date cut-off; the dialer-wide feed does.
    const since = targetFilter ? 0 : Number.isFinite(sinceParam) ? sinceParam : Date.now() - DEFAULT_RANGE_MS;

    const members: Record<string, string> = {};
    for (const m of await listWorkspaceMembers()) {
      const name = [m.firstName, m.lastName].filter(Boolean).join(" ").trim() || m.userEmail || null;
      if (m.id && name) members[m.id] = name;
    }

    const activities: AdminActivity[] = [];
    let cursor: string | undefined;
    let totalCount: number | null = null;
    let truncated = false;

    for (let page = 0; page < MAX_PAGES; page++) {
      const body: any = await fetchTwenty("timelineActivities", {
        limit: PAGE_SIZE,
        startingAfter: cursor,
        query: { order_by: "happensAt[DescNullsLast]", filter: targetFilter ?? DIALER_TARGET_FILTER },
      });
      const rows: any[] = body?.data?.timelineActivities ?? [];
      totalCount ??= typeof body?.totalCount === "number" ? body.totalCount : null;

      let reachedSince = false;
      for (const raw of rows) {
        if (Date.parse(raw?.happensAt ?? raw?.createdAt) < since) {
          reachedSince = true;
          break;
        }
        const mapped = mapActivity(raw, members);
        if (mapped) activities.push(mapped);
      }

      cursor = body?.pageInfo?.endCursor;
      if (reachedSince || rows.length < PAGE_SIZE || !body?.pageInfo?.hasNextPage || !cursor) break;
      if (page === MAX_PAGES - 1) truncated = true;
    }

    log.info(`Returning ${activities.length} dialer activities${truncated ? " (truncated)" : ""}`);
    const response: AdminActivityResponse = { activities, members, totalCount, truncated };
    res.json(response);
  } catch (err: any) {
    log.error("Failed to load admin activity:", err.message);
    res.status(500).json({ error: "Failed to load activity from Twenty", details: err.message });
  }
});

export default router;
