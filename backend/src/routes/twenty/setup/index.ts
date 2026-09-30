import { Router } from "express";
import { authMiddleware, AuthRequest } from "../../../middleware/auth.js";
import { setupTwentyCRM } from "../../../lib/twenty/objectService/index.js";
import { loadSyncConfig } from "../../../lib/twenty/client/index.js";
import { createLogger } from "../../../lib/logger/index.js";
import type { SetupStatusResponse } from "./types.js";

const router = Router();
router.use(authMiddleware);

const log = createLogger('twenty-setup');

/**
 * POST /api/setup/twenty
 * Setup required Twenty CRM objects and fields
 */
router.post("/", async (req: AuthRequest, res) => {
  try {
    log.info(`Setup request from user: ${req.userEmail || 'unknown'}`);

    const results = await setupTwentyCRM();

    log.info(`Setup complete: ${results.objects.length} objects, ${results.fields.length} fields`);
    res.json({
      success: true,
      message: "Twenty CRM setup completed",
      objects: results.objects,
      fields: results.fields,
    });
  } catch (err: any) {
    log.error("Setup failed:", err.message);
    res.status(500).json({
      success: false,
      error: "Setup failed",
      details: err.message,
    });
  }
});

/**
 * GET /api/setup/twenty/status
 * Live check against Twenty metadata: every required object plus the fields
 * the dialer depends on (claim state on agencyPhones, link/timestamp fields
 * on agencyCalls, member attribution columns). Nothing is hardcoded —
 * missing items report exists:false.
 */
router.get("/status", async (_req, res) => {
  try {
    const objects = await queryObjectsWithFields();
    const byName = new Map(objects.map((o) => [o.nameSingular, o]));

    const wantObjects = [
      "agencyProspect",
      "agencyLead",
      "agencyCampaign",
      "agencyScript",
      "agencyPhone",
      "agencyCall",
    ];
    // Fields the backend actually reads/writes (see routes + setup helpers).
    const wantFields: Array<{ object: string; name: string }> = [
      { object: "agencyProspects", name: "createdByMemberId" },
      { object: "agencyPhones", name: "phoneNumber" },
      { object: "agencyPhones", name: "callState" },
      { object: "agencyPhones", name: "claimedByMemberId" },
      { object: "agencyPhones", name: "claimedByEmail" },
      { object: "agencyPhones", name: "claimedAt" },
      { object: "agencyPhones", name: "lastHeartbeatAt" },
      { object: "agencyPhones", name: "currentCallId" },
      { object: "agencyCalls", name: "direction" },
      { object: "agencyCalls", name: "status" },
      { object: "agencyCalls", name: "fromNumber" },
      { object: "agencyCalls", name: "toNumber" },
      { object: "agencyCalls", name: "startedAt" },
      { object: "agencyCalls", name: "endedAt" },
      { object: "agencyCalls", name: "durationSeconds" },
      { object: "agencyCalls", name: "telnyxCallId" },
      { object: "agencyCalls", name: "agencyPhoneId" },
      { object: "agencyCalls", name: "agencyLeadId" },
      { object: "agencyCalls", name: "agencyProspectId" },
      { object: "agencyCalls", name: "createdByMemberId" },
      { object: "agencyCalls", name: "debugLog" },
    ];

    const status: SetupStatusResponse = {
      success: true,
      objects: wantObjects.map((nameSingular) => {
        const found = byName.get(nameSingular);
        return {
          name: found ? found.namePlural : `${nameSingular}s`,
          exists: Boolean(found),
          id: found ? found.id : "",
        };
      }),
      fields: wantFields.map((f) => {
        const obj = objects.find((o) => o.namePlural === f.object);
        return { object: f.object, name: f.name, exists: Boolean(obj?.fields.has(f.name)) };
      }),
    };
    res.json(status);
  } catch (err: any) {
    log.error("Failed to get setup status:", err.message);
    res.status(500).json({
      success: false,
      error: "Failed to get setup status",
      details: err.message,
    });
  }
});

/** Read-only metadata query: object ids/names plus their field names. */
async function queryObjectsWithFields(): Promise<
  Array<{ id: string; nameSingular: string; namePlural: string; fields: Set<string> }>
> {
  const cfg = loadSyncConfig();
  const response = await fetch(`${cfg.twentyBaseUrl}/metadata`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.twentyApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: `{ objects(paging: {first: 100}) { edges { node { id nameSingular namePlural fields(paging: {first: 200}) { edges { node { name } } } } } } }`,
    }),
  });
  if (!response.ok) {
    throw new Error(`Metadata error ${response.status}`);
  }
  const json = await response.json();
  if (json.errors?.length > 0) {
    throw new Error(`Metadata errors: ${JSON.stringify(json.errors).slice(0, 200)}`);
  }
  return (json.data?.objects?.edges ?? []).map((e: any) => ({
    id: e.node.id,
    nameSingular: e.node.nameSingular,
    namePlural: e.node.namePlural,
    fields: new Set((e.node.fields?.edges ?? []).map((f: any) => f.node.name as string)),
  }));
}

export default router;
