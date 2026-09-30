import { Router } from "express";
import { authMiddleware, AuthRequest } from "../../middleware/auth.js";
import { createLogger } from "../../lib/logger/index.js";
import type { DialerMeResponse } from "./types.js";

const router = Router();
const log = createLogger('auth');

/**
 * Identity comes from Twenty OAuth (Hono `/api/oauth`, Twenty is the
 * identity provider). The old email/password route verified hashes against
 * Twenty's Postgres over an SSH tunnel — that path is gone, and with it
 * the `pg`/`bcryptjs` dependency. This router keeps the dialer-JWT
 * endpoints: signup stays disabled, `/me` reads the JWT payload.
 */
router.post("/signup", (_req, res) => {
  res.status(403).json({
    error:
      "Sign up is disabled. Create the member in Twenty, then sign in with Twenty SSO.",
  });
});

router.get("/me", authMiddleware, (req: AuthRequest, res) => {
  // User info is stored in the JWT token payload
  const user: DialerMeResponse = {
    id: req.userId!,
    email: req.userEmail || "",
    fullName: req.userFullName || "",
    role: "agent",
    twentyUserId: req.twentyUserId,
  };

  log.info(`GET /me: ${user.email}`);
  res.json(user);
});

export default router;
