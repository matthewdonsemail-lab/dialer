/**
 * Twenty OAuth provider.
 *
 * One object holding everything a surface needs to talk to Twenty as an
 * OAuth provider: client identity, endpoint discovery (cached per instance),
 * and the four operations (authorize URL, code exchange, refresh,
 * introspection). The backend owns the single confidential instance (it
 * holds the client secret); browsers and CLIs redeem through the Hono
 * `/api/oauth` proxy instead, so the secret never leaves the server.
 *
 * All transport goes through the runtime-agnostic functions in `oauth.ts`,
 * so this provider works in Node, browsers, and workers unchanged.
 *
 * Ported from blaster (`packages/core/src/twenty/oauth/helpers/provider.ts`).
 */

import {
  buildAuthorizeUrl,
  discoverOAuth,
  exchangeCode,
  introspectToken,
  refreshAccessToken,
  registerClient,
  type Introspection,
  type OAuthEndpoints,
  type RegisteredClient,
  type TokenSet,
} from "@dialer/shared";

export interface TwentyProviderConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string | null;
  redirectUri: string;
  scope: string;
}

type FetchFn = typeof fetch;

export class TwentyOAuthProvider {
  private readonly config: TwentyProviderConfig;
  private readonly fetchFn: FetchFn;
  private cached: { baseUrl: string; endpoints: OAuthEndpoints } | null = null;

  constructor(config: TwentyProviderConfig, fetchFn: FetchFn = fetch) {
    this.config = config;
    this.fetchFn = fetchFn;
  }

  /** Server metadata discovery, cached per base URL on this instance. */
  async endpoints(): Promise<OAuthEndpoints> {
    if (this.cached?.baseUrl === this.config.baseUrl) return this.cached.endpoints;
    const endpoints = await discoverOAuth(this.config.baseUrl, this.fetchFn);
    this.cached = { baseUrl: this.config.baseUrl, endpoints };
    return endpoints;
  }

  /** The Twenty consent URL the operator's browser is redirected to. */
  async authorizeUrl(input: { state: string; challenge: string; scope?: string; redirectUri?: string }): Promise<string> {
    const endpoints = await this.endpoints();
    return buildAuthorizeUrl({
      authorizationEndpoint: endpoints.authorizationEndpoint,
      clientId: this.config.clientId,
      redirectUri: input.redirectUri ?? this.config.redirectUri,
      scope: input.scope ?? this.config.scope,
      state: input.state,
      challenge: input.challenge,
    });
  }

  /** RFC 7591 dynamic registration. Throws when the instance publishes no registration endpoint. */
  async registerClient(input: { clientName: string; redirectUris: string[] }): Promise<RegisteredClient> {
    const endpoints = await this.endpoints();
    if (!endpoints.registrationEndpoint) {
      throw new Error("Twenty instance publishes no registration endpoint");
    }
    return registerClient(endpoints.registrationEndpoint, input, this.fetchFn);
  }

  /** Redeem an authorization code. The verifier travels only here. */
  async exchangeCode(input: { code: string; verifier: string; redirectUri?: string }): Promise<TokenSet> {
    const endpoints = await this.endpoints();
    return exchangeCode(
      endpoints.tokenEndpoint,
      {
        code: input.code,
        redirectUri: input.redirectUri ?? this.config.redirectUri,
        verifier: input.verifier,
        auth: { clientId: this.config.clientId, clientSecret: this.config.clientSecret },
      },
      this.fetchFn,
    );
  }

  /** Rotate an expired access token. Null refresh token upstream means re-login. */
  async refreshAccessToken(refreshToken: string): Promise<TokenSet> {
    const endpoints = await this.endpoints();
    return refreshAccessToken(
      endpoints.tokenEndpoint,
      {
        refreshToken,
        auth: { clientId: this.config.clientId, clientSecret: this.config.clientSecret },
      },
      this.fetchFn,
    );
  }

  /**
   * Ask Twenty whether a token is live. This is the user-identity check:
   * Twenty publishes no JWKS, so introspection — not local JWT validation —
   * is how a presented token is verified. Inactive means 401 upstream.
   */
  async introspect(token: string): Promise<Introspection> {
    const endpoints = await this.endpoints();
    if (!endpoints.introspectionEndpoint) {
      throw new Error("Twenty instance publishes no introspection endpoint");
    }
    return introspectToken(
      endpoints.introspectionEndpoint,
      {
        token,
        auth: { clientId: this.config.clientId, clientSecret: this.config.clientSecret },
      },
      this.fetchFn,
    );
  }
}
