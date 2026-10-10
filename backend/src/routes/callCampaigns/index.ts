import { Router } from "express";
import { authMiddleware, AuthRequest } from "../../middleware/auth.js";
import { createTwenty, deleteTwenty, listTwentyAll, updateTwenty } from "../../lib/twenty/client/index.js";
import { resolveActor } from "../../lib/twenty/actor/index.js";
import { createLogger } from "../../lib/logger/index.js";
import { CAMPAIGN_STATUSES, mapCampaign, parseContactIds, type CallCampaignRecord } from "./helpers.js";

const router = Router();
router.use(authMiddleware);
const log = createLogger("call-campaigns");

const NOT_SET_UP =
  "Call campaigns are not set up in Twenty yet. Run `npx tsx --env-file=../.env.local setup-call-campaigns.ts` in backend/ (or POST /api/setup/twenty).";

/** Twenty answers an unknown object with 400/404 mentioning the object name. */
function isMissingObject(err: any): boolean {
  const msg = String(err?.message ?? "");
  return /callCampaign/i.test(msg) && /(404|400|not found|does not exist|Unknown|Cannot find)/i.test(msg);
}

function fail(res: any, err: any, action: string) {
  if (isMissingObject(err)) {
    res.status(503).json({ error: NOT_SET_UP });
    return;
  }
  log.error(`${action} failed: ${err?.message}`);
  res.status(502).json({ error: `Failed to ${action}`, details: err?.message });
}

/** GET /api/call-campaigns - every campaign, newest first. */
router.get("/", async (_req, res) => {
  try {
    const rows = await listTwentyAll<CallCampaignRecord>("callCampaigns");
    res.json(rows.map(mapCampaign).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  } catch (err) {
    fail(res, err, "load call campaigns");
  }
});

/** POST /api/call-campaigns { contactIds, name } - a campaign from the selected contacts. */
router.post("/", async (req: AuthRequest, res) => {
  const contactIds = parseContactIds(req.body?.contactIds);
  if (contactIds.length === 0) {
    res.status(400).json({ error: "Select at least one contact to dial." });
    return;
  }
  const name = String(req.body?.name ?? "").trim() || new Date().toISOString().slice(0, 16).replace("T", " ");
  try {
    const created = await createTwenty<CallCampaignRecord>(
      "callCampaigns",
      {
        name,
        status: "ACTIVE",
        contactIds: JSON.stringify(contactIds),
        createdByMemberId: req.workspaceMemberId ?? "",
        ownerName: req.memberName || req.userFullName || req.userEmail || "",
      },
      await resolveActor(req),
    );
    res.status(201).json(mapCampaign(created));
  } catch (err) {
    fail(res, err, "create the call campaign");
  }
});

/** PATCH /api/call-campaigns/:id { name?, status? } */
router.patch("/:id", async (req: AuthRequest, res) => {
  const patch: Record<string, string> = {};
  if (req.body?.name !== undefined) {
    const name = String(req.body.name).trim();
    if (!name) {
      res.status(400).json({ error: "A campaign needs a name." });
      return;
    }
    patch.name = name;
  }
  if (req.body?.status !== undefined) {
    const status = String(req.body.status).toUpperCase();
    if (!CAMPAIGN_STATUSES.includes(status as any)) {
      res.status(400).json({ error: `Status must be one of ${CAMPAIGN_STATUSES.join(", ")}.` });
      return;
    }
    patch.status = status;
  }
  if (Object.keys(patch).length === 0) {
    res.status(400).json({ error: "Nothing to update." });
    return;
  }
  try {
    const updated = await updateTwenty<CallCampaignRecord>("callCampaigns", req.params.id as string, patch, await resolveActor(req));
    res.json(mapCampaign(updated));
  } catch (err) {
    fail(res, err, "update the call campaign");
  }
});

/** DELETE /api/call-campaigns/:id - statistics and history go with it. */
router.delete("/:id", async (req, res) => {
  try {
    await deleteTwenty("callCampaigns", req.params.id as string);
    res.status(204).end();
  } catch (err) {
    fail(res, err, "delete the call campaign");
  }
});

export default router;
