export interface OAuthServerConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string | null;
  redirectUri: string;
  scope: string;
  /** Basic-auth gate in front of the instance (e.g. the auth-guard nginx), if any. */
  basicAuth: { user: string; password: string } | null;
}
