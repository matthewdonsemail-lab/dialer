import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "cold-dialer-dev-secret-change-in-production";

export interface AuthRequest extends Request {
  userId?: string;
  twentyUserId?: string;
  userRole?: string;
  userEmail?: string;
  userFullName?: string;
  /** The workspaceMember row this session signed in as (set on new JWTs). */
  workspaceMemberId?: string | null;
}

export interface TokenPayload {
  userId: string;
  twentyUserId?: string;
  email?: string;
  fullName?: string;
  /** The workspaceMember id the session resolved to (null for pre-migration JWTs). */
  workspaceMemberId?: string | null;
}

export function generateToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid authorization header" });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as TokenPayload;
    req.userId = payload.userId;
    req.twentyUserId = payload.twentyUserId;
    req.userEmail = payload.email;
    req.userFullName = payload.fullName;
    req.workspaceMemberId = payload.workspaceMemberId ?? null;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
