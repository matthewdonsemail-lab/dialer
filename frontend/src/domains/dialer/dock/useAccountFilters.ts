import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type SavedFilterView } from "@/domains/api/client";

/**
 * Scopes whose account copy was applied in this page load. The dock's
 * Contacts tab remounts after every call; applying the account copy again
 * then put the filters back to how they were when the page loaded.
 */
const appliedScopes = new Set<string>();

/**
 * Keeps a filter set on the signed-in member's account (dialerFilterView in
 * Twenty) as well as in this browser. On load the account's copy wins, so
 * the filters follow the user to any browser; every change is written back
 * a moment after the last click. Named views are saved and removed here too.
 */
export function useAccountFilters<T extends Record<string, string>>(scope: string, value: T, setValue: (next: T) => void, defaults: T) {
  const queryClient = useQueryClient();
  const key = ["filter-views", scope];
  const { data, isSuccess } = useQuery({ queryKey: key, queryFn: () => api.filterViews.list(scope), staleTime: 5 * 60_000, retry: false });

  // What the account holds right now, so a change only writes when it differs.
  const synced = useRef<string | null>(null);
  const loaded = useRef(appliedScopes.has(scope));
  useEffect(() => {
    if (!isSuccess || loaded.current) return;
    loaded.current = true;
    appliedScopes.add(scope);
    if (data?.current) {
      const merged = { ...defaults, ...data.current } as T;
      synced.current = JSON.stringify(merged);
      if (synced.current !== JSON.stringify(value)) setValue(merged);
    }
  }, [isSuccess, data, defaults, value, setValue]);

  const json = JSON.stringify(value);
  useEffect(() => {
    if (!loaded.current || json === synced.current) return;
    const t = setTimeout(() => {
      synced.current = json;
      // The cached account copy follows, so nothing reads back the older one.
      queryClient.setQueryData(key, (d: typeof data) => (d ? { ...d, current: value } : d));
      api.filterViews.saveCurrent(scope, value).catch(() => {
        // Not saved to the account (offline, or not set up): this browser still has it.
        synced.current = null;
      });
    }, 800);
    return () => clearTimeout(t);
    // value is captured through json
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [json, scope]);

  const save = useMutation({
    mutationFn: (name: string) => api.filterViews.create(scope, name, value),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.filterViews.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  return {
    views: data?.views ?? ([] as SavedFilterView[]),
    apply: (view: SavedFilterView) => setValue({ ...defaults, ...view.filters } as T),
    saveAs: (name: string) => save.mutateAsync(name),
    remove: (id: string) => remove.mutateAsync(id),
    saving: save.isPending,
  };
}
