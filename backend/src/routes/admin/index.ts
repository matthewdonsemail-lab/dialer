import { Router } from "express";
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
router.get("/activity", async (req, res) => {
  try {
    const sinceParam = typeof req.query.since === "string" ? Date.parse(req.query.since) : NaN;
    const targets = typeof req.query.targets === "string" ? req.query.targets : "";
    const targetFilter = targets ? recordTargetFilter(targets) : null;
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
