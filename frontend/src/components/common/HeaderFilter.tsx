import { ArrowDownAZ, ArrowUpZA, ListFilter, X } from "lucide-react";
import type { SortDirection } from "@/lib/list-sort";
import { MenuRow, SelectMenu } from "@/components/ui/Menu";

export interface HeaderFilterOption {
  value: string;
  label: string;
  count?: number;
}

interface HeaderFilterProps {
  /** Column label shown in the menu */
  label: string;
  /** Current value; "all" means no filter. Omit for sort-only columns. */
  value?: string;
  /** Filter values. Omit or pass [] for sort-only columns. */
  options?: HeaderFilterOption[];
  onChange?: (newValue: string) => void;
  /** Sort controls. `direction` is null when this column is not the sort key. */
  sort?: { direction: SortDirection | null; onSort: (direction: SortDirection | null) => void };
}

const ALL = "all";

/**
 * Column header menu: sort A→Z / Z→A, then the column's values as filters
 * with counts. The icon stays visible (in brand colour) while the column is
 * sorted or filtered, so the header shows what is shaping the table.
 */
export function HeaderFilter({ label, value = ALL, options = [], onChange, sort }: HeaderFilterProps) {
  const filtered = value !== ALL;
  const sorted = (sort?.direction ?? null) !== null;
  const active = filtered || sorted;
  const total = options.reduce((sum, o) => sum + (o.count ?? 0), 0);

  return (
    <SelectMenu
      value={options.length > 0 ? value : null}
      searchable={options.length > 8}
      width={240}
      onChange={(v) => onChange?.(v)}
      triggerTitle={`Sort or filter ${label}`}
      triggerClassName={`ml-1 p-0.5 rounded-[4px] transition-colors ${
        active
          ? "text-[var(--ods-brand-600)] bg-[var(--ods-brand-50)] dark:bg-[var(--ods-brand-900)]/40"
          : "text-[var(--ods-text-tertiary)] opacity-0 group-hover/th:opacity-100 hover:text-[var(--ods-text-primary)] aria-expanded:opacity-100"
      }`}
      trigger={
        sorted && !filtered ? (
          sort!.direction === "asc" ? <ArrowDownAZ className="w-3.5 h-3.5" /> : <ArrowUpZA className="w-3.5 h-3.5" />
        ) : (
          <ListFilter className="w-3.5 h-3.5" />
        )
      }
      header={(close) =>
        sort ? (
          <div className={options.length > 0 ? "pb-1 mb-1 border-b border-[var(--ods-border)]" : ""}>
            <div className="px-3 py-1.5 bg-[var(--ods-bg-secondary)] text-[11px] font-semibold uppercase tracking-wider text-[var(--ods-text-tertiary)]">
              Sort {label}
            </div>
            <MenuRow
              option={{ value: "asc", label: "A → Z (low to high)" }}
              selected={sort.direction === "asc"}
              onSelect={() => {
                close();
                sort.onSort("asc");
              }}
            />
            <MenuRow
              option={{ value: "desc", label: "Z → A (high to low)" }}
              selected={sort.direction === "desc"}
              onSelect={() => {
                close();
                sort.onSort("desc");
              }}
            />
            {sorted && (
              <button
                onClick={() => {
                  close();
                  sort.onSort(null);
                }}
                className="mx-1 w-[calc(100%-8px)] h-8 px-2.5 flex items-center gap-2 rounded-[6px] text-[12px] text-[var(--ods-text-secondary)] hover:bg-[var(--ods-hover)]"
              >
                <X className="w-3.5 h-3.5" />
                Clear sort
              </button>
            )}
          </div>
        ) : null
      }
      sections={
        options.length > 0
          ? [
              { title: `Filter ${label}`, options: [{ value: ALL, label: "All", hint: total }] },
              { options: options.map((o) => ({ value: o.value, label: o.label, hint: o.count })) },
            ]
          : []
      }
    />
  );
}
