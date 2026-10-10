import { ApiError } from "@/lib/api-client/api-error";

export interface ErrorDescription {
  /** One sentence the person can act on. */
  detail: string;
  /** Whether doing the same thing again could work. */
  retryable: boolean;
  /** The kind, for logs and tests. */
  kind: "network" | "auth" | "forbidden" | "missing" | "refused" | "invalid" | "server" | "unknown";
}

/** Server messages that only say "it failed" add nothing; the details carry the reason. */
const GENERIC = /^(failed to|request failed|internal server error|error\b)/i;

function trim(text: string, max = 200): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * Any thrown value as words. Refusals from the pipelines (409, 422) pass the
 * server's own reason through unchanged: it already says what to do.
 * Pure (no React, no I/O), so every screen words failures the same way.
 */
export function describeError(err: unknown): ErrorDescription {
  if (err instanceof ApiError) {
    const own = err.message && !GENERIC.test(err.message) ? err.message : "";
    const why = err.details ? trim(err.details) : "";
    switch (true) {
      case err.status === 0:
        return { kind: "network", retryable: true, detail: "The dialer server could not be reached. Check your connection, then try again." };
      case err.status === 401:
        return { kind: "auth", retryable: false, detail: "Your session has ended. Sign in again, then repeat the change." };
      case err.status === 403:
        return { kind: "forbidden", retryable: false, detail: own || "You are not allowed to do this." };
      case err.status === 404:
        return { kind: "missing", retryable: false, detail: own || "It no longer exists in Twenty. Refresh the page." };
      case err.status === 409:
        return { kind: "refused", retryable: false, detail: own || why || "This change conflicts with the record's current state." };
      case err.status === 400 || err.status === 422:
        return { kind: "invalid", retryable: false, detail: own || why || "Twenty did not accept these values." };
      case err.status >= 500:
        return {
          kind: "server",
          retryable: true,
          detail: why ? `Twenty did not accept the change: ${why}` : own ? `${own}. Try again.` : "The server had a problem. Try again.",
        };
      default:
        return { kind: "unknown", retryable: true, detail: own || why || `Request failed (${err.status}).` };
    }
  }
  if (err instanceof Error && err.message) return { kind: "unknown", retryable: true, detail: trim(err.message) };
  return { kind: "unknown", retryable: true, detail: "Something went wrong. Try again." };
}
