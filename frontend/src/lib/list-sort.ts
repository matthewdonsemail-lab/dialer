export type SortDirection = "asc" | "desc";

export interface ColumnSort {
  key: string;
  direction: SortDirection;
}

/**
 * Statuses that sink to the bottom of a list: already worked, or opted out.
 * Matched on the Twenty label, because "Do Not Contact" and "Lost" share one
 * mapped status value and the label is what the operator sees.
 */
const BOTTOM_STATUS_LABEL = /^(contacted|do not contact)$/i;

export function isBottomStatus(status: string | undefined, options: { value: string; label: string }[]): boolean {
  const label = options.find((o) => o.value === status)?.label ?? status ?? "";
  return BOTTOM_STATUS_LABEL.test(label.trim());
}

type SortValue = string | number | null | undefined;

/**
 * Sort rows for display. Bottom-status rows always come last; within each
 * group the column sort applies. Blank values sink to the end of their group
 * whichever way the column is sorted. The sort is stable, so rows that tie
 * keep their existing order.
 */
export function sortRows<T>(
  rows: T[],
  {
    sort,
    isBottom,
    valueOf,
  }: {
    sort: ColumnSort | null;
    isBottom: (row: T) => boolean;
    valueOf: (row: T, key: string) => SortValue;
  },
): T[] {
  const dir = sort?.direction === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const groupDiff = Number(isBottom(a)) - Number(isBottom(b));
    if (groupDiff !== 0 || !sort) return groupDiff;

    const va = valueOf(a, sort.key);
    const vb = valueOf(b, sort.key);
    const aBlank = va === null || va === undefined || va === "";
    const bBlank = vb === null || vb === undefined || vb === "";
    if (aBlank || bBlank) return Number(aBlank) - Number(bBlank);
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
    return String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: "base" }) * dir;
  });
}
