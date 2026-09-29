import { Hono } from "hono";
import { cors } from "hono/cors";
import { generateToken } from "../../../middleware/auth.js";
import {
  checkOperatorToken,
  exchangeAuthorizationCode,
  loadOAuthConfig,
  oauthEndpoints,
  refreshOperatorToken,
} from "../../../lib/twenty/oauth/index.js";
import { TwentyOAuthError } from "@dialer/shared";
import { createLogger } from "../../../lib/logger.js";
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
    return c.json({ active: true, username: result.username, scope: result.scope });
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
    const email = result.username ?? "operator@twenty";
    log.info(`OAuth session minted for: ${email}`);
    const token = generateToken({
      userId: email,
      twentyUserId: email,
      email,
      fullName: email,
    });
    return c.json({
      user: { id: email, email, fullName: email, role: "agent" },
      token,
    });
  } catch (error) {
    return fail(c, error, "Failed to create the dialer session", 502);
  }
});
