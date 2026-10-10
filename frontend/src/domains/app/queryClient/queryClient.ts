import { QueryCache, QueryClient } from "@tanstack/react-query";
import { describeError } from "@/domains/feedback/describeError";
import { notify } from "@/domains/feedback/bus";
import { ApiError } from "@/domains/api/error";

/** Last warning time per query, so a flaky refresh warns once a minute, not on every retry. */
const warnedAt = new Map<string, number>();

export const queryClient = new QueryClient({
  // A refresh that fails while older data is on screen is otherwise invisible:
  // the page keeps showing stale rows as if they were current. Say so.
  // A first load that fails is not toasted: the page shows its own error state.
  queryCache: new QueryCache({
    onError: (err, query) => {
      if (query.state.data === undefined || query.meta?.quiet) return;
      const key = query.queryHash;
      const now = Date.now();
      if (now - (warnedAt.get(key) ?? 0) < 60_000) return;
      warnedAt.set(key, now);
      notify({ variant: "warning", title: "Showing older data", detail: `A refresh failed. ${describeError(err).detail}` });
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      // Retry once for a dropped connection or a 5xx. A 4xx is the server's
      // answer (a 429 especially: retrying only spends more of the budget).
      retry: (failures, err) => failures < 1 && !(err instanceof ApiError && err.status >= 400 && err.status < 500),
    },
  },
});
