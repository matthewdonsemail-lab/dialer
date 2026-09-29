import type { OAuthServerConfig } from "../types.js";

/** Read the server-side OAuth config from env. Pure: null when incomplete. */
export function loadOAuthConfig(env: NodeJS.ProcessEnv = process.env): OAuthServerConfig | null {
  const baseUrl = env.TWENTY_BASE_URL;
  const clientId = env.TWENTY_OAUTH_CLIENT_ID;
  const redirectUri = env.TWENTY_OAUTH_REDIRECT_URI;
  if (!baseUrl || !clientId || !redirectUri) return null;
  const basicUser = env.TWENTY_BASIC_USER;
  const basicPassword = env.TWENTY_BASIC_PASSWORD;
  return {
    baseUrl,
    clientId,
    clientSecret: env.TWENTY_OAUTH_CLIENT_SECRET ?? null,
    redirectUri,
    scope: env.TWENTY_OAUTH_SCOPE ?? "api profile",
    basicAuth: basicUser && basicPassword ? { user: basicUser, password: basicPassword } : null,
  };
}
