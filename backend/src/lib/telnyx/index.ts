import Telnyx from "telnyx";

/**
 * Telnyx SDK client (server-side only — the API key never leaves the backend).
 * All Telnyx REST calls in routes go through here instead of hand-rolled fetch.
 */
export function telnyxClient(): InstanceType<typeof Telnyx> {
  const apiKey = process.env.TELNYX_API_KEY;
  if (!apiKey) {
    throw new Error("TELNYX_API_KEY not configured");
  }
  return new Telnyx({ apiKey });
}

/** Narrow SDK errors to safe messages (never leak key material). */
export function telnyxErrorMessage(err: any): string {
  const status = err?.status ?? err?.statusCode;
  const msg =
    err?.error?.message || err?.message || (typeof err === "string" ? err : "Telnyx request failed");
  return `Telnyx ${status ?? "?"}: ${String(msg).slice(0, 200)}`;
}
