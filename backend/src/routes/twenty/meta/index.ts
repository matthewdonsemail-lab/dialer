import { Router } from "express";
import { authMiddleware, AuthRequest } from "../../../middleware/auth.js";
import { fetchTwenty } from "../../../lib/twenty-client.js";
import { createLogger } from "../../../lib/logger.js";
import type { TwentyObject } from "./types.js";
import { findTargetObject, extractFieldOptions } from "./helpers/index.js";

const router = Router();
router.use(authMiddleware);

const log = createLogger('twentyMeta');

/**
 * Get field metadata for a Twenty object, including SELECT options
 */
router.get("/:object", async (req, res) => {
  try {
    const objectName = req.params.object;
    
    const response = await fetchTwenty<{ data: TwentyObject[] }>("/metadata/objects");
    const allObjects = response.data || [];
    
    // Find matching object by name
    const targetObject = findTargetObject(allObjects, objectName);

    if (!targetObject) {
      return res.status(404).json({ error: `Object "${objectName}" not found` });
    }

    // Extract field options into a flat map
    const fieldOptions = extractFieldOptions(targetObject);
    
    log.info(`Fetched field options for ${objectName}: ${Object.keys(fieldOptions).join(", ")}`);
    res.json({
      object: {
        singular: targetObject.nameSingular,
        plural: targetObject.namePlural,
      },
      // Public base URL so the frontend can deep-link column headers into
      // Twenty settings (not a secret — it's the workspace address).
      baseUrl: (process.env.TWENTY_BASE_URL || "").replace(/\/$/, ""),
      fields: fieldOptions,
    });
  } catch (err: any) {
    log.error("Failed to fetch field metadata:", err.message);
    res.status(500).json({ error: "Failed to fetch field metadata", details: err.message });
  }
});

export default router;
