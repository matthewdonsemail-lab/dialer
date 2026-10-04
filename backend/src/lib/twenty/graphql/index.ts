import { createClient } from "@dialer/shared/api";
import { createLogger } from "../../logger/index.js";

const log = createLogger("twenty-graphql");

/**
 * Typed Twenty GraphQL client (generated from the live workspace schema —
 * see `bun run api:client`). Authenticated with the server-side API key,
 * so it never leaves the backend. For reads that need workspace typing
 * instead of the hand-rolled REST wrappers in `twenty-client.ts`.
 */
export function twentyGraphqlClient() {
  const baseUrl = process.env.TWENTY_BASE_URL;
  const apiKey = process.env.TWENTY_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error(
      "TWENTY_BASE_URL and TWENTY_API_KEY environment variables are required",
    );
  }
  log.info("Creating typed GraphQL client");
  return createClient({
    url: `${baseUrl.replace(/\/$/, "")}/graphql`,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });
}
