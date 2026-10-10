/**
 * Bark server base URL.
 *
 * Defaults to the public Bark server (https://api.day.app).
 * Override with BARK_SERVER_URL when self-hosting. Trailing slashes are stripped.
 *
 * Docs: https://bark.day.app/#/en-us/tutorial
 */
export function getBarkServerUrl(env: NodeJS.ProcessEnv = process.env): string {
  const raw = (env.BARK_SERVER_URL || "https://api.day.app").trim();
  return raw.replace(/\/+$/, "");
}