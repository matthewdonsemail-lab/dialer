import { usePersistedState } from "@/domains/app/persistedState";
import type { ColumnSort } from "./listSort";

/**
 * Search, sort and column filters for one table, saved per `tableId` so they
 * survive opening a record and reloading. Created by the page (not inside
 * DataTable) so the page can clear them together with its own filters.
 */
export function useDataTable(tableId: string) {
  const [search, setSearch] = usePersistedState(`${tableId}-filter-search`, "");
  const [sort, setSort] = usePersistedState<ColumnSort | null>(`${tableId}-sort`, null);
  const [columnFilters, setColumnFilters] = usePersistedState<Record<string, string>>(`${tableId}-filter-columns`, {});

  const setColumnFilter = (key: string, value: string) =>
    setColumnFilters((prev) => {
      const next = { ...prev };
      if (value === "all") delete next[key];
      else next[key] = value;
      return next;
    });

  const clear = () => {
    setSearch("");
    setColumnFilters({});
  };

  return {
    tableId,
    search,
    setSearch,
    sort,
    setSort,
    columnFilters,
    setColumnFilter,
    clear,
    hasActiveFilters: search !== "" || Object.keys(columnFilters).length > 0,
  };
}

export type DataTableState = ReturnType<typeof useDataTable>;
