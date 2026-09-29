import { Router, Request, Response } from "express";
import { twentyClient } from "../../lib/twenty-client.js";

interface AuthRequest extends Request {
  user?: { id: string; email: string };
}

const router = Router();

// List all profiles
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const profiles = await twentyClient.list<any>('agencyProfiles');
    res.json(profiles);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch profiles", details: err.message });
  }
});

// Get profile by ID
router.get("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const profile = await twentyClient.get<any>('agencyProfiles', id);
    res.json(profile);
  } catch (err: any) {
    res.status(404).json({ error: "Profile not found" });
  }
});

export const profilesRouter = router;
