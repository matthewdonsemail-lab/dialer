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
  // Identity comes from the JWT minted at OAuth session time. When the
  // session resolved a workspaceMember, the sidebar renders the member.
  const name = req.memberName || req.userFullName || "";
  const memberId = req.workspaceMemberId || null;
  const user: DialerMeResponse = {
    id: req.userId!,
    email: req.userEmail || "",
    fullName: name,
    role: "agent",
    twentyUserId: req.twentyUserId,
    workspaceMemberId: memberId,
    member: memberId
      ? { id: memberId, name, avatarUrl: req.avatarUrl || null }
      : undefined,
  };

  log.info(`GET /me: ${user.email} member=${memberId || "none"}`);
  res.json(user);
});

export default router;
