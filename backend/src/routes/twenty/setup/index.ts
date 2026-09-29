import { Router } from "express";
import { authMiddleware, AuthRequest } from "../../../middleware/auth.js";
import { setupTwentyCRM } from "../../../lib/twenty-object-service.js";
import { createLogger } from "../../../lib/logger.js";
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
 * Get current setup status
 */
router.get("/status", async (_req, res) => {
  try {
    // This would query Twenty to check if objects exist
    // For now, return a placeholder
    const status: SetupStatusResponse = {
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
