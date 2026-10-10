import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";

type WithId = { id: string };

/**
 * Apply `fn` to the rows in a cached value, whether it is a plain list or an
 * infinite query of pages ({ pages: [{ rows }] }, as the paged Contacts table uses).
 */
function mapRows<T>(data: unknown, fn: (rows: T[]) => T[]): unknown {
  if (Array.isArray(data)) return fn(data as T[]);
  const d = data as { pages?: { rows?: T[] }[] } | undefined;
  if (d?.pages) return { ...d, pages: d.pages.map((p) => (p?.rows ? { ...p, rows: fn(p.rows) } : p)) };
  return data;
}

interface RecordKeys {
  /**
   * The cached list the tables read, e.g. ["prospects"]. Every cached query
   * starting with this key is patched, so paged variants stay in sync.
   */
  listKey: QueryKey;
  /** The cached single record a detail page reads, e.g. (id) => ["prospect", id]. */
  detailKey?: (id: string) => QueryKey;
}

/**
 * Edits show instantly: the cached list (and detail record) is patched before
 * the request goes out, and restored if the save fails.
 *
 * On success the cache is only marked stale, not refetched. Twenty can serve
 * the old value for a moment after a write, so an immediate refetch would
 * flash the row back to its previous state; the next page visit reloads it.
 */
export function useOptimisticUpdate<T extends WithId>(
  { listKey, detailKey }: RecordKeys,
  save: (id: string, patch: Partial<T>) => Promise<unknown>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<T> }) => save(id, patch),
    onMutate: async ({ id, patch }) => {
      const dKey = detailKey?.(id);
      // Stop in-flight reads from overwriting the optimistic value.
      await queryClient.cancelQueries({ queryKey: listKey });
      if (dKey) await queryClient.cancelQueries({ queryKey: dKey });

      const prevList = queryClient.getQueriesData({ queryKey: listKey });
      const prevDetail = dKey ? queryClient.getQueryData<T>(dKey) : undefined;
      queryClient.setQueriesData({ queryKey: listKey }, (old) => mapRows<T>(old, (rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r))));
      if (dKey && prevDetail) queryClient.setQueryData<T>(dKey, { ...prevDetail, ...patch });
      return { prevList, prevDetail, dKey };
    },
    onError: (_error, _vars, ctx) => {
      for (const [key, value] of ctx?.prevList ?? []) queryClient.setQueryData(key, value);
      if (ctx?.dKey && ctx.prevDetail) queryClient.setQueryData(ctx.dKey, ctx.prevDetail);
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: listKey, refetchType: "none" });
      const dKey = detailKey?.(id);
      if (dKey) queryClient.invalidateQueries({ queryKey: dKey, refetchType: "none" });
    },
  });
}

/** Rows disappear instantly and come back if the delete fails. Accepts one id or many. */
export function useOptimisticDelete<T extends WithId>(
  { listKey }: RecordKeys,
  remove: (id: string) => Promise<unknown>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string | string[]) => {
      await Promise.all((Array.isArray(ids) ? ids : [ids]).map((id) => remove(id)));
    },
    onMutate: async (ids) => {
      const gone = new Set(Array.isArray(ids) ? ids : [ids]);
      await queryClient.cancelQueries({ queryKey: listKey });
      const prevList = queryClient.getQueriesData({ queryKey: listKey });
      queryClient.setQueriesData({ queryKey: listKey }, (old) => mapRows<T>(old, (rows) => rows.filter((r) => !gone.has(r.id))));
      return { prevList };
    },
    onError: (_error, _ids, ctx) => {
      // Some deletes in a batch may have succeeded; reload to show the truth.
      for (const [key, value] of ctx?.prevList ?? []) queryClient.setQueryData(key, value);
      queryClient.invalidateQueries({ queryKey: listKey });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: listKey, refetchType: "none" });
    },
  });
}
