import { QueryCache, QueryClient } from "@tanstack/react-query";
import { describeError } from "@/domains/feedback/describeError";
import { notify } from "@/domains/feedback/bus";

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
      retry: 1,
    },
  },
});
