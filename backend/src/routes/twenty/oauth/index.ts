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
import { TwentyOAuthError, type Introspection } from "@dialer/shared";
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
  /** The workspaceMember row this session signed in as (or null when unresolvable). */
  member: WorkspaceMemberRecord | null;
}

/**
 * Resolve a resolved email/fullName to the workspaceMember row it belongs to.
 *
 * The introspection `username`/`sub` path only proves "a user signed in";
 * the workspaceMember record is what the dialer needs so its writes can be
 * attributed to the member instead of the anonymous API-key actor.
 * Lookup order (cheap first): the introspection `sub` is the member's
 * `userId`, so match `userId` first, then fall back to email (case-insensitive).
 * Best-effort — a miss never fails sign-in.
 */
async function resolveMember(
  introspection: { sub: string | null },
  email: string,
): Promise<WorkspaceMemberRecord | null> {
  const sub = introspection.sub?.trim() || null;
  try {
    if (sub) {
      const byUserId = await findWorkspaceMember({ userId: sub });
      if (byUserId) return byUserId;
    }
    const byEmail = await findWorkspaceMember({ email });
    if (byEmail) return byEmail;
  } catch (err: any) {
    log.info(`workspaceMember resolution failed (${err?.message || err})`);
  }
  return null;
}

/**
 * Who just signed in, in human terms.
 *
 * Twenty's introspection answers "is this token live?" but carries no
 * `username` for operator tokens, which is how every session ended up as
 * the literal "operator@twenty". Resolution chain:
 *   1. introspection `username`, when it looks like an email;
 *   2. introspection `sub` -> Twenty REST `workspaceMembers/{sub}` (server
 *      API key; bare /rest is exempt from the auth-guard) -> `userEmail`;
 *   3. the historical "operator@twenty" fallback (unchanged behavior).
 * Every step is best-effort and logged; a miss never fails sign-in.
 */
async function resolveOperatorIdentity(
  config: OAuthServerConfig,
  introspection: { username: string | null; sub: string | null },
): Promise<ResolvedIdentity> {
  const fallback: ResolvedIdentity = {
    email: "operator@twenty",
    fullName: "operator@twenty",
    via: "fallback",
    member: null,
  };
  const username = introspection.username?.trim() || null;
  if (username && username.includes("@")) {
    const member = await resolveMember(introspection, username);
    const fullName =
      member?.firstName || member?.lastName
        ? `${member?.firstName ?? ""} ${member?.lastName ?? ""}`.trim()
        : username;
    return { email: username, fullName, via: "introspection:username", member };
  }
  const sub = introspection.sub?.trim() || null;
  const apiKey = process.env.TWENTY_API_KEY || "";
  if (sub && config.baseUrl && apiKey) {
    try {
      const res = await fetch(
        `${config.baseUrl.replace(/\/$/, "")}/rest/workspaceMembers/${encodeURIComponent(sub)}`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
      );
      if (res.ok) {
        const json = (await res.json()) as any;
        const node = json?.data?.workspaceMember ?? json?.data ?? json;
        const rawEmail = node?.userEmail ?? node?.email;
        const email = typeof rawEmail === "string" && rawEmail.includes("@") ? rawEmail : null;
        if (email) {
          const first = node?.name?.firstName ?? "";
          const last = node?.name?.lastName ?? "";
          const fullName = `${first} ${last}`.trim() || email;
          const member: WorkspaceMemberRecord = {
            id: node?.id ?? "",
            userId: node?.userId ?? sub,
            userEmail: email,
            firstName: first || null,
            lastName: last || null,
            barkKey: null,
            barkKeyRaw: node?.barkKey ?? null,
          };
          return { email, fullName, via: "rest:workspaceMembers", member };
        }
        log.info(`workspaceMembers/${sub} returned no email; keeping fallback identity`);
      } else {
        log.info(`workspaceMembers/${sub} lookup -> ${res.status}; keeping fallback identity`);
      }
    } catch (err: any) {
      log.info(`workspaceMembers lookup failed (${err?.message || err}); keeping fallback identity`);
    }
  }
  return fallback;
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
    const identity = await resolveOperatorIdentity(config, result);
    return c.json({ active: true, username: result.username, email: identity.email, scope: result.scope });
  } catch (error) {
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
    const identity = await resolveOperatorIdentity(config, result);
    log.info(`OAuth session minted for: ${identity.email} (via ${identity.via})`);
    const member = identity.member;
    const token = generateToken({
      userId: identity.email,
      // Prefer the member's userId; keep email for backward compatibility
      // so old consumers that read the email still work.
      twentyUserId: member?.userId ?? identity.email,
      workspaceMemberId: member?.id ?? null,
      email: identity.email,
      fullName: identity.fullName,
    });
    return c.json({
      user: {
        id: identity.email,
        email: identity.email,
        fullName: identity.fullName,
        role: "agent",
        workspaceMemberId: member?.id ?? null,
        twentyUserId: member?.userId ?? null,
      },
      token,
    });
  } catch (error) {
    return fail(c, error, "Failed to create the dialer session", 502);
  }
});
