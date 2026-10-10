import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

// Evaluated lazily (not at import time): this module is imported before
// index.ts runs dotenv.config(), so reading the env at module top would
// always see an empty environment and refuse to boot.
let cachedSecret: string | null = null;

function getJwtSecret(): string {
  if (!cachedSecret) {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) {
      throw new Error(
        "JWT_SECRET must be set to a random value of at least 32 characters. " +
        "Refusing to boot with an insecure default."
      );
    }
    cachedSecret = secret;
  }
  return cachedSecret;
}

export interface AuthRequest extends Request {
  userId?: string;
  twentyUserId?: string;
  userRole?: string;
  userEmail?: string;
  userFullName?: string;
  /** The workspaceMember row this session signed in as (set on new JWTs). */
  workspaceMemberId?: string | null;
  memberName?: string;
  avatarUrl?: string;
}

export interface TokenPayload {
  userId: string;
  twentyUserId?: string;
  email?: string;
  fullName?: string;
  /** The workspaceMember id the session resolved to (null for pre-migration JWTs). */
  workspaceMemberId?: string | null;
  memberName?: string;
  avatarUrl?: string;
}

export function generateToken(payload: TokenPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "24h" });
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid authorization header" });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, getJwtSecret()) as TokenPayload;
    req.userId = payload.userId;
    req.twentyUserId = payload.twentyUserId;
    req.userEmail = payload.email;
    req.userFullName = payload.fullName;
    req.workspaceMemberId = payload.workspaceMemberId ?? null;
    req.memberName = payload.memberName;
    req.avatarUrl = payload.avatarUrl;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

/**
 * Member identity for member-mandatory writes. The workspaceMember UUID is
 * minted into the JWT at OAuth session time and derived here server-side —
 * never from client-supplied `memberId` bodies. Sessions without a resolved
 * member (legacy or fallback sessions) must re-login for these routes (401).
 */
export function requireMember(
  req: AuthRequest,
  res: Response,
): { id: string; email: string; name: string } | null {
  const id = req.workspaceMemberId?.trim();
  if (!id) {
    res.status(401).json({ error: "Session has no workspace member identity. Sign in again." });
    return null;
  }
  return {
    id,
    email: req.userEmail || "",
    name: req.memberName || req.userEmail || id,
  };
}

/**
 * The signed-in member a request belongs to ("member:<id>"), or null when it
 * carries no valid dialer JWT. Used to give each operator their own
 * rate-limit budget instead of one shared per IP.
 */
export function sessionKey(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  try {
    const payload = jwt.verify(header.slice(7), getJwtSecret()) as TokenPayload;
    const id = payload.workspaceMemberId || payload.userId;
    return id ? `member:${id}` : null;
  } catch {
    return null;
  }
}
