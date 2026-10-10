import { Router } from "express";
import { authMiddleware, AuthRequest } from "../../../middleware/auth.js";
import { setupTwentyCRM } from "../../../lib/twenty/objectService/index.js";
import { readLiveSchema, SCHEMA_MANIFEST } from "../../../lib/twenty/schema/index.js";
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
 * Live check against Twenty metadata for every object, field and relation in
 * the schema manifest (lib/twenty/schema). Read-only; missing items report
 * exists:false. `bun run twenty:schema` (or POST above) creates them.
 */
router.get("/status", async (_req, res) => {
  try {
    const live = await readLiveSchema();
    const plural = new Map(SCHEMA_MANIFEST.objects.map((o) => [o.nameSingular, o.namePlural]));
    const wantFields = [
      ...SCHEMA_MANIFEST.objects.flatMap((o) => o.fields.map((f) => ({ object: o.nameSingular, name: f.name }))),
      ...SCHEMA_MANIFEST.relations.map((r) => ({ object: r.object, name: r.name })),
    ];

    const status: SetupStatusResponse = {
      success: true,
      objects: SCHEMA_MANIFEST.objects.map((o) => {
        const found = live.get(o.nameSingular);
        return { name: o.namePlural, exists: Boolean(found), id: found ? found.id : "" };
      }),
      fields: wantFields.map((f) => ({
        object: plural.get(f.object) ?? f.object,
        name: f.name,
        exists: Boolean(live.get(f.object)?.fields.has(f.name)),
      })),
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

export default router;
