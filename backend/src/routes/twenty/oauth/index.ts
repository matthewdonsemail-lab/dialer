import { Hono } from "hono";
import { cors } from "hono/cors";
import { generateToken } from "../../../middleware/auth.js";
import type { OAuthServerConfig } from "../../../lib/twenty/oauth/types.js";
import {
  checkOperatorToken,
  exchangeAuthorizationCode,
  loadOAuthConfig,
  oauthEndpoints,
  refreshOperatorToken,
} from "../../../lib/twenty/oauth/index.js";
import { findWorkspaceMember, type WorkspaceMemberRecord } from "../../../lib/twenty/workspaceMember/index.js";
import {
  decodeJwtPayload,
  TwentyOAuthError,
  type Introspection,
  type TwentyAccessTokenClaims,
} from "@dialer/shared";
import { createLogger } from "../../../lib/logger/index.js";
import type { TokenRequestBody, RefreshRequestBody, SessionRequestBody } from "./types.js";

const log = createLogger("oauth");

/**
 * Operator auth against Twenty (Twenty is the identity provider).
 *
 * This is a Hono sub-app mounted inside the Express server at
 * `/api/oauth` via `getRequestListener` (same Hono style as the
 * railcode worker and blaster). Hono owns these routes so the OAuth
 * surface stays identical across backends; Express keeps everything else.
 *
 * The browser never holds the client secret and never depends on Twenty's
 * CORS posture: it builds the authorize redirect from public config,
 * then redeems the code through this proxy. Tokens live in the browser
 * session; the secret never leaves the server.
 *
 * Password login is gone — there is no direct-Postgres path anymore.
 * `POST /session` exchanges a live Twenty access token for a dialer JWT
 * so every existing `Authorization: Bearer <dialer-jwt>` route is untouched.
 */
export const oauthApp = new Hono();

oauthApp.use("/*", cors());

/** Provider bodies never reach the client verbatim. */
function fail(c: any, error: unknown, fallback: string, status = 500) {
  if (error instanceof TwentyOAuthError) {
    const providerStatus = error.status;
    log.error(`${fallback} (provider ${providerStatus}):`, error.message);
    if (providerStatus >= 500) return c.json({ error: fallback, detail: error.message }, 502);
    return c.json({ error: fallback, detail: error.message }, providerStatus);
  }
  log.error(fallback, error instanceof Error ? error.message : String(error));
  return c.json({ error: fallback }, status);
}

function requireConfig(c: any) {
  const config = loadOAuthConfig();
  if (!config) return { config: null, response: c.json({ error: "Twenty OAuth is not configured" }, 500) };
  return { config, response: null };
}

interface ResolvedIdentity {
  email: string;
  fullName: string;
  via: string;
  /** The workspaceMember row this session signed in as. Never null: an
   *  unresolvable token throws UnresolvedMemberError instead. */
  member: WorkspaceMemberRecord;
}

/** No member resolved: the session must not be minted. */
export class UnresolvedMemberError extends Error {
  constructor(readonly claimNames: string[]) {
    super(
      "Your Twenty account could not be matched to a workspace member. " +
        "Ask a workspace admin to confirm you are a member of this workspace.",
    );
    this.name = "UnresolvedMemberError";
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Every email-shaped string in the introspection response.
 *
 * Twenty publishes no `userinfo_endpoint` and no `currentUser` query, so
 * introspection is the only view of the token we get. Rather than trusting one
 * documented field that this instance leaves empty, take any claim that looks
 * like an email. Deterministic order so a token with two email claims always
 * resolves the same way.
 */
function emailsFromClaims(claims: Record<string, unknown>): string[] {
  const found: string[] = [];
  for (const [key, value] of Object.entries(claims)) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (EMAIL_RE.test(trimmed) && !found.includes(trimmed)) {
      log.info(`introspection claim "${key}" looks like an email`);
      found.push(trimmed);
    }
  }
  return found;
}

/**
 * Map a live token to its workspaceMember.
 *
 * Signals, cheapest and most authoritative first:
 *   1. `sub` as a workspaceMember record id  (exact, survives an email change)
 *   2. `sub` as the member's `userId`       (a user can hold several members)
 *   3. any email-shaped claim -> member by userEmail
 *
 * There is no fabricated fallback: a token that maps to nobody is an error, not
 * an "operator@twenty" session. That fake identity is what made the sidebar lie
 * and then failed every member-scoped route with a 401.
 */
async function resolveOperatorIdentity(
  introspection: Introspection,
): Promise<ResolvedIdentity> {
  const sub = introspection.sub?.trim() || null;
  const emails = emailsFromClaims(introspection.claims ?? {});

  if (sub) {
    const byMemberId = await findWorkspaceMember({ workspaceMemberId: sub });
    if (byMemberId) return identityFrom(byMemberId, "sub:memberId");

    const byUserId = await findWorkspaceMember({ userId: sub });
    if (byUserId) return identityFrom(byUserId, "sub:userId");
  }

  for (const email of emails) {
    const byEmail = await findWorkspaceMember({ email });
    if (byEmail) return identityFrom(byEmail, "claim:email");
  }

  throw new UnresolvedMemberError(Object.keys(introspection.claims ?? {}).sort());
}

function identityFrom(member: WorkspaceMemberRecord, via: string): ResolvedIdentity {
  const fullName =
    `${member.firstName ?? ""} ${member.lastName ?? ""}`.trim() ||
    member.userEmail ||
    member.id;
  return { email: member.userEmail || fullName, fullName, via, member };
}


oauthApp.get("/config", async (c) => {
  const { config, response } = requireConfig(c);
  if (!config) return response;
  try {
    const endpoints = await oauthEndpoints(config.baseUrl);
    return c.json({
      authorizationEndpoint: endpoints.authorizationEndpoint,
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      scope: config.scope,
    });
  } catch (error) {
    return fail(c, error, "Failed to read Twenty OAuth discovery");
  }
});

oauthApp.post("/token", async (c) => {
  const { config, response } = requireConfig(c);
  if (!config) return response;
  const body = (await c.req.json().catch(() => null)) as TokenRequestBody | null;
  if (!body?.code || !body.verifier) {
    return c.json({ error: "code and verifier are required" }, 400);
  }
  try {
    const tokens = await exchangeAuthorizationCode(config, {
      code: body.code,
      verifier: body.verifier,
      redirectUri: body.redirectUri,
    });
    return c.json({ tokens });
  } catch (error) {
    return fail(c, error, "Failed to exchange the authorization code", 502);
  }
});

oauthApp.post("/refresh", async (c) => {
  const { config, response } = requireConfig(c);
  if (!config) return response;
  const body = (await c.req.json().catch(() => null)) as RefreshRequestBody | null;
  if (!body?.refreshToken) return c.json({ error: "refreshToken is required" }, 400);
  try {
    const tokens = await refreshOperatorToken(config, body.refreshToken);
    return c.json({ tokens });
  } catch (error) {
    return fail(c, error, "Failed to refresh the operator token", 502);
  }
});

/** Who is calling: introspect the Bearer token, 401 when it is not live. */
oauthApp.get("/me", async (c) => {
  const { config, response } = requireConfig(c);
  if (!config) return response;
  const header = c.req.header("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!token) return c.json({ error: "Bearer token is required" }, 401);
  try {
    const result = await checkOperatorToken(config, token);
    if (!result.active) return c.json({ error: "Token is not active" }, 401);
    const identity = await resolveOperatorIdentity(result, token);
    return c.json({
      active: true,
      email: identity.email,
      workspaceMemberId: identity.member.id,
      fullName: identity.fullName,
      resolvedVia: identity.via,
      scope: result.scope,
    });
  } catch (error) {
    if (error instanceof UnresolvedMemberError) {
      return c.json({ error: error.message, claims: error.claimNames }, 403);
    }
    return fail(c, error, "Failed to validate the operator token", 502);
  }
});

/**
 * Mint a dialer JWT for a live Twenty access token.
 *
 * The SPA finishes PKCE (code → Twenty tokens via `/token`), then calls
 * here once. Introspection proves the token is live; the dialer JWT keeps
 * every existing route on its current `authMiddleware` contract.
 */
oauthApp.post("/session", async (c) => {
  const { config, response } = requireConfig(c);
  if (!config) return response;
  const body = (await c.req.json().catch(() => null)) as SessionRequestBody | null;
  if (!body?.accessToken) return c.json({ error: "accessToken is required" }, 400);
  try {
    const result = await checkOperatorToken(config, body.accessToken);
    if (!result.active) return c.json({ error: "Token is not active" }, 401);
    const identity = await resolveOperatorIdentity(result, body.accessToken);
    log.info(`OAuth session minted for: ${identity.email} (via ${identity.via})`);
    const member = identity.member;
    const memberAvatar = (member as any)?.avatarUrl;
    const token = generateToken({
      userId: identity.email,
      // Prefer the member's userId; keep email for backward compatibility
      // so old consumers that read the email still work.
      twentyUserId: member?.userId ?? identity.email,
      workspaceMemberId: member.id,
      email: identity.email,
      fullName: identity.fullName,
      memberName: identity.fullName,
      avatarUrl: typeof memberAvatar === "string" ? memberAvatar : undefined,
    });
    return c.json({
      user: {
        id: identity.email,
        email: identity.email,
        fullName: identity.fullName,
        role: "agent",
        workspaceMemberId: member.id,
        twentyUserId: member.userId ?? null,
        member: {
          id: member.id,
          name: identity.fullName,
          avatarUrl: typeof memberAvatar === "string" ? memberAvatar : null,
        },
      },
      token,
    });
  } catch (error) {
    if (error instanceof UnresolvedMemberError) {
      // Never mint a session we cannot attribute: "operator@twenty" made the
      // UI show a fake operator and then 401'd every member-scoped route.
      log.error(`Unresolved workspace member. introspection claims: ${error.claimNames.join(", ")}`);
      return c.json(
        { error: error.message, claims: error.claimNames },
        403,
      );
    }
    return fail(c, error, "Failed to create the dialer session", 502);
  }
});/**
 * Map a live Twenty token to its workspaceMember.
 *
 * Twenty application access tokens use the application id as `sub`, so
 * introspection.sub must not be treated as the human identity. After
 * introspection proves the token is active, read the user identity from the
 * signed token payload and resolve it against workspaceMembers.userId.
 * Email remains a compatibility fallback for deployments that expose it.
 */
async function resolveOperatorIdentity(
  introspection: Introspection,
  accessToken: string,
): Promise<ResolvedIdentity> {
  let claims: TwentyAccessTokenClaims;
  try {
    claims = decodeJwtPayload<TwentyAccessTokenClaims>(accessToken);
  } catch (error) {
    throw new UnresolvedMemberError([
      ...Object.keys(introspection.claims ?? {}).sort(),
      "token.userId",
      "token.userWorkspaceId",
    ]);
  }

  if (claims.userWorkspaceId) {
    const byMemberId = await findWorkspaceMember({ workspaceMemberId: claims.userWorkspaceId });
    if (byMemberId) return identityFrom(byMemberId, "jwt:userWorkspaceId");
  }

  if (claims.userId) {
    const byUserId = await findWorkspaceMember({ userId: claims.userId });
    if (byUserId) return identityFrom(byUserId, "jwt:userId");
  }

  const emails = emailsFromClaims(introspection.claims ?? {});
  for (const email of emails) {
    const byEmail = await findWorkspaceMember({ email });
    if (byEmail) return identityFrom(byEmail, "claim:email");
  }

  throw new UnresolvedMemberError([
    ...Object.keys(introspection.claims ?? {}).sort(),
    "token.userId",
    "token.userWorkspaceId",
  ]);
}

function identityFrom(member: WorkspaceMemberRecord, via: string): ResolvedIdentity {
  const fullName =
    `${member.firstName ?? ""} ${member.lastName ?? ""}`.trim() ||
    member.userEmail ||
    member.id;
  return { email: member.userEmail || fullName, fullName, via, member };
}


oauthApp.get("/config", async (c) => {
  const { config, response } = requireConfig(c);
  if (!config) return response;
  try {
    const endpoints = await oauthEndpoints(config.baseUrl);
    return c.json({
      authorizationEndpoint: endpoints.authorizationEndpoint,
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      scope: config.scope,
    });
  } catch (error) {
    return fail(c, error, "Failed to read Twenty OAuth discovery");
  }
});

oauthApp.post("/token", async (c) => {
  const { config, response } = requireConfig(c);
  if (!config) return response;
  const body = (await c.req.json().catch(() => null)) as TokenRequestBody | null;
  if (!body?.code || !body.verifier) {
    return c.json({ error: "code and verifier are required" }, 400);
  }
  try {
    const tokens = await exchangeAuthorizationCode(config, {
      code: body.code,
      verifier: body.verifier,
      redirectUri: body.redirectUri,
    });
    return c.json({ tokens });
  } catch (error) {
    return fail(c, error, "Failed to exchange the authorization code", 502);
  }
});

oauthApp.post("/refresh", async (c) => {
  const { config, response } = requireConfig(c);
  if (!config) return response;
  const body = (await c.req.json().catch(() => null)) as RefreshRequestBody | null;
  if (!body?.refreshToken) return c.json({ error: "refreshToken is required" }, 400);
  try {
    const tokens = await refreshOperatorToken(config, body.refreshToken);
    return c.json({ tokens });
  } catch (error) {
    return fail(c, error, "Failed to refresh the operator token", 502);
  }
});

/** Who is calling: introspect the Bearer token, 401 when it is not live. */
oauthApp.get("/me", async (c) => {
  const { config, response } = requireConfig(c);
  if (!config) return response;
  const header = c.req.header("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!token) return c.json({ error: "Bearer token is required" }, 401);
  try {
    const result = await checkOperatorToken(config, token);
    if (!result.active) return c.json({ error: "Token is not active" }, 401);
    const identity = await resolveOperatorIdentity(result);
    return c.json({
      active: true,
      email: identity.email,
      workspaceMemberId: identity.member.id,
      fullName: identity.fullName,
      resolvedVia: identity.via,
      scope: result.scope,
    });
  } catch (error) {
    if (error instanceof UnresolvedMemberError) {
      return c.json({ error: error.message, claims: error.claimNames }, 403);
    }
    return fail(c, error, "Failed to validate the operator token", 502);
  }
});

/**
 * Mint a dialer JWT for a live Twenty access token.
 *
 * The SPA finishes PKCE (code → Twenty tokens via `/token`), then calls
 * here once. Introspection proves the token is live; the dialer JWT keeps
 * every existing route on its current `authMiddleware` contract.
 */
oauthApp.post("/session", async (c) => {
  const { config, response } = requireConfig(c);
  if (!config) return response;
  const body = (await c.req.json().catch(() => null)) as SessionRequestBody | null;
  if (!body?.accessToken) return c.json({ error: "accessToken is required" }, 400);
  try {
    const result = await checkOperatorToken(config, body.accessToken);
    if (!result.active) return c.json({ error: "Token is not active" }, 401);
    const identity = await resolveOperatorIdentity(result);
    log.info(`OAuth session minted for: ${identity.email} (via ${identity.via})`);
    const member = identity.member;
    const memberAvatar = (member as any)?.avatarUrl;
    const token = generateToken({
      userId: identity.email,
      // Prefer the member's userId; keep email for backward compatibility
      // so old consumers that read the email still work.
      twentyUserId: member?.userId ?? identity.email,
      workspaceMemberId: member.id,
      email: identity.email,
      fullName: identity.fullName,
      memberName: identity.fullName,
      avatarUrl: typeof memberAvatar === "string" ? memberAvatar : undefined,
    });
    return c.json({
      user: {
        id: identity.email,
        email: identity.email,
        fullName: identity.fullName,
        role: "agent",
        workspaceMemberId: member.id,
        twentyUserId: member.userId ?? null,
        member: {
          id: member.id,
          name: identity.fullName,
          avatarUrl: typeof memberAvatar === "string" ? memberAvatar : null,
        },
      },
      token,
    });
  } catch (error) {
    if (error instanceof UnresolvedMemberError) {
      // Never mint a session we cannot attribute: "operator@twenty" made the
      // UI show a fake operator and then 401'd every member-scoped route.
      log.error(`Unresolved workspace member. introspection claims: ${error.claimNames.join(", ")}`);
      return c.json(
        { error: error.message, claims: error.claimNames },
        403,
      );
    }
    return fail(c, error, "Failed to create the dialer session", 502);
  }
});
