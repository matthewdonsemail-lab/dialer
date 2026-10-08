/**
 * Operator sign-in against Twenty (Twenty is the identity provider).
 *
 * Standard SPA code flow with S256 PKCE: the verifier is stored per `state`
 * (see pendingStores), the browser is redirected to Twenty's authorize endpoint,
 * Twenty returns to /callback, and the code is redeemed through the Hono
 * `/api/oauth/token` proxy — the client secret never reaches the browser.
 * `POST /api/oauth/session` then exchanges the live Twenty token for a
 * dialer JWT, so every existing API call is untouched.
 *
 * PKCE math comes from @dialer/shared (single source with the backend).
 */
import {
  buildAuthorizeUrl,
  codeChallengeForVerifier,
  generateCodeVerifier,
  generateState,
  type TokenSet,
} from "@dialer/shared";
import { setAuthToken } from "@/lib/api-client";

const API_URL = import.meta.env.VITE_API_URL || "";

export interface PublicAuthConfig {
  authorizationEndpoint: string;
  clientId: string;
  redirectUri: string;
  scope: string;
}

export interface OperatorSession {
  tokens: TokenSet;
  obtainedAtMs: number;
}

const SESSION_KEY = "dialer.operator.session";
const PENDING_PREFIX = "dialer.oauth.pending.";
/** How long a started sign-in may take, including signing in to Twenty. */
const PENDING_TTL_MS = 15 * 60 * 1000;

interface PendingFlow {
  verifier: string;
  state: string;
  createdAtMs: number;
}

/**
 * In-progress PKCE flows, keyed by their unguessable `state`.
 *
 * localStorage rather than sessionStorage: the callback does not always land
 * in the tab that started sign-in (a Twenty sign-in finished in another tab or
 * window, a browser that restores the callback into a new tab). Keying by
 * state keeps concurrent flows apart, and the TTL sweep bounds what is left
 * behind. sessionStorage is the fallback when localStorage is unavailable.
 */
function pendingStores(): Storage[] {
  const stores: Storage[] = [];
  for (const get of [() => window.localStorage, () => window.sessionStorage]) {
    try {
      const store = get();
      if (store) stores.push(store);
    } catch {
      // Storage disabled by browser policy: try the next one.
    }
  }
  return stores;
}

function savePendingFlow(flow: PendingFlow): void {
  sweepExpiredFlows();
  for (const store of pendingStores()) {
    try {
      store.setItem(PENDING_PREFIX + flow.state, JSON.stringify(flow));
      return;
    } catch {
      // Quota or policy failure: try the next store.
    }
  }
  throw new Error("This browser is blocking site storage, so sign-in cannot continue. Allow storage for this site and try again.");
}

function readPendingFlow(state: string): PendingFlow | null {
  for (const store of pendingStores()) {
    try {
      const raw = store.getItem(PENDING_PREFIX + state);
      if (!raw) continue;
      const flow = JSON.parse(raw) as PendingFlow;
      if (flow.state === state && Date.now() - flow.createdAtMs < PENDING_TTL_MS) return flow;
    } catch {
      // Unreadable entry: treat as missing.
    }
  }
  return null;
}

function removePendingFlow(state: string): void {
  for (const store of pendingStores()) {
    try {
      store.removeItem(PENDING_PREFIX + state);
    } catch {
      // Nothing to clean up.
    }
  }
}

function sweepExpiredFlows(): void {
  for (const store of pendingStores()) {
    try {
      for (let i = store.length - 1; i >= 0; i--) {
        const key = store.key(i);
        if (!key?.startsWith(PENDING_PREFIX)) continue;
        const flow = JSON.parse(store.getItem(key) ?? "null") as PendingFlow | null;
        if (!flow || Date.now() - flow.createdAtMs >= PENDING_TTL_MS) store.removeItem(key);
      }
    } catch {
      // Best effort only.
    }
  }
}

function api(path: string, init?: RequestInit) {
  return fetch(`${API_URL}${path}`, init);
}

async function publicConfig(): Promise<PublicAuthConfig> {
  const response = await api("/api/oauth/config");
  if (!response.ok) throw new Error("Twenty SSO is not configured on the backend");
  return (await response.json()) as PublicAuthConfig;
}

function readSession(): OperatorSession | null {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OperatorSession;
    if (!parsed?.tokens?.accessToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSession(session: OperatorSession): void {
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearOperatorSession(): void {
  window.sessionStorage.removeItem(SESSION_KEY);
}

export function loadOperatorSession(): OperatorSession | null {
  return readSession();
}

/** Start sign-in: stash the verifier, redirect to Twenty. */
export async function beginSignIn(): Promise<void> {
  if (!API_URL) throw new Error("VITE_API_URL must be set — the dialer backend is required for login.");
  const config = await publicConfig();
  // Guard against the classic port-mismatch trap: Twenty returns the browser
  // to config.redirectUri after authorization. If this tab runs anywhere else
  // (e.g. dev server on :3000 while the registered callback is on :5173),
  // the browser lands on a dead address with ERR_CONNECTION_REFUSED and no
  // useful message. Fail here instead, naming both sides. See docs/identity.md.
  try {
    const expectedOrigin = new URL(config.redirectUri).origin;
    if (window.location.origin !== expectedOrigin) {
      throw new Error(
        `This page runs at ${window.location.origin}, but Twenty will send you back to ${config.redirectUri} after sign-in — nothing listens there, so the browser would show "connection refused". ` +
          `Run the frontend on the registered callback origin (local dev: port 5173 with strictPort, see frontend/vite.config.ts), or register ${window.location.origin}/callback as a redirect URI on the Twenty OAuth client and set TWENTY_OAUTH_REDIRECT_URI to match.`,
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("will send you back")) throw error;
    throw new Error("The backend returned an invalid OAuth redirect URI. Check TWENTY_OAUTH_REDIRECT_URI.");
  }
  const verifier = generateCodeVerifier();
  const state = generateState();
  savePendingFlow({ verifier, state, createdAtMs: Date.now() });
  window.location.assign(
    buildAuthorizeUrl({
      authorizationEndpoint: config.authorizationEndpoint,
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      scope: config.scope,
      state,
      challenge: await codeChallengeForVerifier(verifier),
    }),
  );
}

/** Finish sign-in on /callback: verify state, redeem code, mint dialer JWT. */
export async function finishSignIn(search: string): Promise<void> {
  const params = new URLSearchParams(search);
  const code = params.get("code") ?? "";
  const returnedState = params.get("state") ?? "";
  if (params.get("error")) {
    throw new Error(`Twenty refused authorization: ${params.get("error_description") ?? params.get("error")}`);
  }
  if (!code) throw new Error("Twenty returned no authorization code");

  // StrictMode re-runs effects in dev; any concurrent call with the same code
  // must reuse the one in-flight exchange, and the pending entry stays until
  // redemption succeeds so a re-run re-validates instead of racing a deleted key.
  const pendingKey = `dialer.oauth.pending:${code}`;
  const cached = finishSignInCache.get(pendingKey);
  if (cached && cached.state === returnedState) return cached.promise;

  const pending = returnedState ? readPendingFlow(returnedState) : null;
  if (!pending) {
    throw new Error("This sign-in link has expired or was already used. Start sign-in again.");
  }

  const promise = (async () => {
    try {
      const tokenRes = await api("/api/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, verifier: pending.verifier }),
      });
      if (!tokenRes.ok) throw new Error("Code redemption failed. Start sign-in again.");
      const { tokens } = (await tokenRes.json()) as { tokens: TokenSet };
      writeSession({ tokens, obtainedAtMs: Date.now() });
      removePendingFlow(pending.state);

      const sessionRes = await api("/api/oauth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: tokens.accessToken }),
      });
      if (!sessionRes.ok) {
        // Surface the server's reason. A 403 here means the token could not be
        // matched to a workspaceMember, which the user can actually act on.
        const body = (await sessionRes.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || "Could not create the dialer session. Start sign-in again.");
      }
      const { token } = (await sessionRes.json()) as { token: string };
      setAuthToken(token);
      finishSignInCache.clear();
    } catch (error) {
      finishSignInCache.delete(pendingKey);
      throw error;
    }
  })();

  finishSignInCache.set(pendingKey, { state: returnedState, promise });
  return promise;
}

const finishSignInCache = new Map<string, { state: string; promise: Promise<void> }>();
