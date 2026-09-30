/**
 * Twenty OAuth 2.0 client (authorization code + PKCE, refresh, introspect).
 *
 * Twenty is its own OAuth provider (see
 * `{TWENTY_BASE_URL}/.well-known/oauth-authorization-server`): dynamic client
 * registration per RFC 7591, S256 PKCE, `api` and `profile` scopes, standard
 * token/refresh/introspect endpoints. This module speaks that surface with
 * nothing but global fetch and WebCrypto, so the same code runs in Node,
 * browsers, and workers unchanged.
 *
 * Shared domain (backend + SPA import this — never copy it): the client is
 * a public PKCE client. The verifier stays in sessionStorage and code
 * redemption is proxied through the Hono `/api/oauth` routes; no client
 * secret is required or stored.
 */

export class TwentyOAuthError extends Error {
  readonly status: number;

  constructor(status: number, detail: string) {
    super(`Twenty OAuth ${status}: ${detail}`);
    this.name = "TwentyOAuthError";
    this.status = status;
  }
}

export interface OAuthEndpoints {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint: string | null;
  introspectionEndpoint: string | null;
  revocationEndpoint: string | null;
}

export interface RegisteredClient {
  clientId: string;
  clientSecret: string | null;
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number | null;
  scope: string | null;
}

export interface Introspection {
  active: boolean;
  username: string | null;
  /** RFC 7662 subject. For Twenty application tokens this is the application id. */
  sub: string | null;
  scope: string | null;
  expiresAt: number | null;
  /** The raw RFC 7662 response. */
  claims: Record<string, unknown>;
}

export interface TwentyAccessTokenClaims {
  sub?: string;
  applicationId?: string;
  workspaceId?: string;
  userId?: string;
  userWorkspaceId?: string;
  type?: string;
  exp?: number;
  iat?: number;
}

type FetchFn = typeof fetch;

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/**
 * base64url without padding, from raw bytes. Hand-rolled so this module
 * needs no runtime globals: no btoa (absent in some Node typings), no
 * Buffer (absent in browsers).
 */
export function base64UrlEncode(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] as number;
    const b = i + 1 < bytes.length ? (bytes[i + 1] as number) : 0;
    const c = i + 2 < bytes.length ? (bytes[i + 2] as number) : 0;
    const triple = (a << 16) | (b << 8) | c;
    out += BASE64_ALPHABET[(triple >> 18) & 63];
    out += BASE64_ALPHABET[(triple >> 12) & 63];
    out += i + 1 < bytes.length ? BASE64_ALPHABET[(triple >> 6) & 63] : "";
    out += i + 2 < bytes.length ? BASE64_ALPHABET[triple & 63] : "";
  }
  return out.replace(/\+/g, "-").replace(/\//g, "_");
}

/** Decode a JWT payload after Twenty introspection has established that the token is live.
 * This does not verify the signature; introspection is the trust boundary.
 */
export function decodeJwtPayload<T extends Record<string, unknown>>(token: string): T {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new TwentyOAuthError(502, "Twenty access token is not a JWT");
  }

  const encoded = parts[1] ?? "";
  const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const bytes: number[] = [];

  for (let i = 0; i < padded.length; i += 4) {
    const a = BASE64_ALPHABET.indexOf(padded[i] ?? "=");
    const b = BASE64_ALPHABET.indexOf(padded[i + 1] ?? "=");
    const c = BASE64_ALPHABET.indexOf(padded[i + 2] ?? "=");
    const d = BASE64_ALPHABET.indexOf(padded[i + 3] ?? "=");
    if (a < 0 || b < 0 || c < 0 || d < 0) {
      throw new TwentyOAuthError(502, "Twenty access token has an invalid JWT payload");
    }
    bytes.push((a << 2) | (b >> 4));
    if (c !== 64) bytes.push(((b & 15) << 4) | (c >> 2));
    if (d !== 64) bytes.push(((c & 3) << 6) | d);
  }

  try {
    return JSON.parse(new TextDecoder().decode(new Uint8Array(bytes))) as T;
  } catch {
    throw new TwentyOAuthError(502, "Twenty access token has an invalid JWT payload");
  }
}

/** Filter crypto.getRandomValues through an injectable source for tests. */
export function randomBase64Url(
  byteLength: number,
  rand: (bytes: Uint8Array) => Uint8Array = (bytes) => crypto.getRandomValues(bytes),
): string {
  return base64UrlEncode(rand(new Uint8Array(byteLength)));
}

/** 32 random bytes: 43 chars, inside the RFC 7636 43-128 bound. */
export function generateCodeVerifier(): string {
  return randomBase64Url(32);
}

/** 16 random bytes: the per-flow state nonce. */
export function generateState(): string {
  return randomBase64Url(16);
}

/** S256 challenge: base64url(SHA256(verifier)). Async — WebCrypto only. */
export async function codeChallengeForVerifier(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

/**
 * Server metadata discovery. Endpoint paths come from the document, never
 * from string constants, so self-hosted instances with different paths work.
 */
export async function discoverOAuth(baseUrl: string, fetchFn: FetchFn = fetch): Promise<OAuthEndpoints> {
  const response = await fetchFn(joinUrl(baseUrl, ".well-known/oauth-authorization-server"));
  if (!response.ok) {
    throw new TwentyOAuthError(response.status, (await response.text().catch(() => "")).slice(0, 300));
  }
  const doc = (await response.json()) as Record<string, unknown>;
  const pick = (name: string, required: boolean): string | null => {
    const value = doc[name];
    if (typeof value === "string" && value !== "") return new URL(value, baseUrl).toString();
    if (required) throw new TwentyOAuthError(502, `Twenty discovery document has no ${name}`);
    return null;
  };
  return {
    authorizationEndpoint: pick("authorization_endpoint", true) as string,
    tokenEndpoint: pick("token_endpoint", true) as string,
    registrationEndpoint: pick("registration_endpoint", false),
    introspectionEndpoint: pick("introspection_endpoint", false),
    revocationEndpoint: pick("revocation_endpoint", false),
  };
}

/** RFC 7591 dynamic registration for the public PKCE client. */
export async function registerClient(
  registrationEndpoint: string,
  input: { clientName: string; redirectUris: string[] },
  fetchFn: FetchFn = fetch,
): Promise<RegisteredClient> {
  const response = await fetchFn(registrationEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: input.clientName,
      redirect_uris: input.redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      token_endpoint_auth_method: "none",
    }),
  });
  if (!response.ok) {
    throw new TwentyOAuthError(response.status, (await response.text().catch(() => "")).slice(0, 300));
  }
  const body = (await response.json()) as { client_id?: unknown; client_secret?: unknown };
  if (typeof body.client_id !== "string" || body.client_id === "") {
    throw new TwentyOAuthError(502, "Twenty registration returned no client_id");
  }
  return {
    clientId: body.client_id,
    clientSecret: typeof body.client_secret === "string" ? body.client_secret : null,
  };
}

export function buildAuthorizeUrl(input: {
  authorizationEndpoint: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  challenge: string;
}): string {
  const url = new URL(input.authorizationEndpoint);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("scope", input.scope);
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

interface ClientAuth {
  clientId: string;
  clientSecret: string | null;
}

function clientAuthBody(auth: ClientAuth): Record<string, string> {
  // Twenty advertises `client_secret_post` and `none`: secreted clients post
  // it, public clients omit it. Never put it in the URL.
  return auth.clientSecret
    ? { client_id: auth.clientId, client_secret: auth.clientSecret }
    : { client_id: auth.clientId };
}

function toTokenSet(body: Record<string, unknown>): TokenSet {
  if (typeof body.access_token !== "string" || body.access_token === "") {
    throw new TwentyOAuthError(502, "Twenty token endpoint returned no access_token");
  }
  return {
    accessToken: body.access_token,
    refreshToken: typeof body.refresh_token === "string" ? body.refresh_token : null,
    expiresIn: typeof body.expires_in === "number" ? body.expires_in : null,
    scope: typeof body.scope === "string" ? body.scope : null,
  };
}

async function postForm(
  endpoint: string,
  params: Record<string, string>,
  fetchFn: FetchFn,
): Promise<Record<string, unknown>> {
  const response = await fetchFn(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  if (!response.ok) {
    throw new TwentyOAuthError(response.status, (await response.text().catch(() => "")).slice(0, 300));
  }
  return (await response.json()) as Record<string, unknown>;
}

/** Redeem an authorization code. The verifier never travels except here. */
export async function exchangeCode(
  tokenEndpoint: string,
  input: { code: string; redirectUri: string; verifier: string; auth: ClientAuth },
  fetchFn: FetchFn = fetch,
): Promise<TokenSet> {
  return toTokenSet(
    await postForm(
      tokenEndpoint,
      {
        grant_type: "authorization_code",
        code: input.code,
        redirect_uri: input.redirectUri,
        code_verifier: input.verifier,
        ...clientAuthBody(input.auth),
      },
      fetchFn,
    ),
  );
}

/** Rotate an expired access token. Null refresh token means re-login. */
export async function refreshAccessToken(
  tokenEndpoint: string,
  input: { refreshToken: string; auth: ClientAuth },
  fetchFn: FetchFn = fetch,
): Promise<TokenSet> {
  return toTokenSet(
    await postForm(
      tokenEndpoint,
      { grant_type: "refresh_token", refresh_token: input.refreshToken, ...clientAuthBody(input.auth) },
      fetchFn,
    ),
  );
}

/**
 * Ask Twenty whether a token is live. This is how backends validate
 * operator tokens without a JWKS: introspection is the documented
 * mechanism, and `active: false` is the only answer that matters.
 */
export async function introspectToken(
  introspectionEndpoint: string,
  input: { token: string; auth: ClientAuth },
  fetchFn: FetchFn = fetch,
): Promise<Introspection> {
  const body = await postForm(
    introspectionEndpoint,
    { token: input.token, ...clientAuthBody(input.auth) },
    fetchFn,
  );
  return {
    active: body.active === true,
    username: typeof body.username === "string" ? body.username : null,
    sub: typeof body.sub === "string" ? body.sub : null,
    scope: typeof body.scope === "string" ? body.scope : null,
    expiresAt: typeof body.exp === "number" ? body.exp : null,
    claims: body,
  };
}

/** True when `expiresIn` seconds from `obtainedAtMs` have passed (60s skew). */
export function isTokenExpired(obtainedAtMs: number, expiresIn: number | null, nowMs = Date.now()): boolean {
  if (expiresIn === null) return false;
  return nowMs >= obtainedAtMs + expiresIn * 1000 - 60_000;
}
