import { TwentyOAuthProvider, type Introspection, type OAuthEndpoints, type TokenSet } from "./helpers/index.js";
import { loadOAuthConfig } from "./helpers/index.js";
import type { OAuthServerConfig } from "./types.js";

let cachedProvider: { key: string; provider: TwentyOAuthProvider } | null = null;

/**
 * fetch that presents the instance's basic-auth gate (the auth-guard
 * nginx sits in front of /authorize, /oauth/*, and /.well-known on
 * self-hosted deployments; bare /rest and /graphql are exempted).
 */
function basicAuthFetch(basic: { user: string; password: string }) {
  const header = `Basic ${Buffer.from(`${basic.user}:${basic.password}`).toString("base64")}`;
  return (input: RequestInfo | URL, init?: RequestInit) =>
    fetch(input, { ...init, headers: { ...(init?.headers as Record<string, string> | undefined), Authorization: header } });
}

export function twentyProvider(config: OAuthServerConfig): TwentyOAuthProvider {
  const key = `${config.baseUrl} ${config.clientId} ${config.redirectUri} ${config.scope} ${config.basicAuth?.user ?? ""}`;
  if (cachedProvider?.key !== key) {
    cachedProvider = {
      key,
      provider: new TwentyOAuthProvider(
        {
          baseUrl: config.baseUrl,
          clientId: config.clientId,
          clientSecret: config.clientSecret,
          redirectUri: config.redirectUri,
          scope: config.scope,
        },
        config.basicAuth ? basicAuthFetch(config.basicAuth) : fetch,
      ),
    };
  }
  return cachedProvider.provider;
}

export async function oauthEndpoints(baseUrl: string): Promise<OAuthEndpoints> {
  const config = loadOAuthConfig();
  if (config && config.baseUrl === baseUrl) {
    return twentyProvider(config).endpoints();
  }
  return new TwentyOAuthProvider({
    baseUrl,
    clientId: "",
    clientSecret: null,
    redirectUri: "",
    scope: "",
  }).endpoints();
}

export async function exchangeAuthorizationCode(
  config: OAuthServerConfig,
  input: { code: string; verifier: string; redirectUri?: string },
): Promise<TokenSet> {
  return twentyProvider(config).exchangeCode(input);
}

export async function refreshOperatorToken(
  config: OAuthServerConfig,
  refreshToken: string,
): Promise<TokenSet> {
  return twentyProvider(config).refreshAccessToken(refreshToken);
}

/** Introspect a presented Bearer token. Inactive or unknown means 401. */
export async function checkOperatorToken(
  config: OAuthServerConfig,
  token: string,
): Promise<Introspection> {
  return twentyProvider(config).introspect(token);
}
