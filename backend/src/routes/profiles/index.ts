import { Router, Response } from "express";
import { authMiddleware, type AuthRequest } from "../../middleware/auth.js";
import { twentyClient } from "../../lib/twenty/client/index.js";

const router = Router();
router.use(authMiddleware);

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
