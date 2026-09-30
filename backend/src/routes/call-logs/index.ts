import { Router, Response } from "express";
import { twentyClient } from "../../lib/twenty/client/index.js";
import type { CallLogsAuthRequest as AuthRequest, CreateCallLogBody } from "./types.js";
import { buildCallLogPayload } from "./helpers/index.js";

const router = Router();

// List all call logs
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const logs = await twentyClient.list<any>('agencyCallLogs');
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch call logs", details: err.message });
  }
});

// Get call logs by lead ID
router.get("/lead/:leadId", async (req: AuthRequest, res: Response) => {
  try {
    const { leadId } = req.params;
    const logs = await twentyClient.list<any>('agencyCallLogs', {
      filter: JSON.stringify({ field: "leadId", operator: "eq", value: leadId }),
    });
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch call logs", details: err.message });
  }
});

// Get call log by ID
router.get("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const callLog = await twentyClient.get<any>('agencyCallLogs', id);
    res.json(callLog);
  } catch (err: any) {
    res.status(404).json({ error: "Call log not found" });
  }
});

// Create a call log
router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const payload = buildCallLogPayload((req.body ?? {}) as CreateCallLogBody);

    const result = await twentyClient.create<any>('agencyCallLogs', payload);
    res.status(201).json(result.data || result);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to create call log", details: err.message });
  }
});

export const callLogsRouter = router;
