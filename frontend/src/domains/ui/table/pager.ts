/** Rows-per-page choices for a paged table. */
export const PAGE_SIZE_CHOICES = [20, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 50;

/** How many pages `total` rows make at `size` per page (at least 1). */
export function pageCount(total: number, size: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, size)));
}

/** A saved page size that is not one of the choices falls back to the default. */
export function parsePageSize(value: unknown): number {
  return PAGE_SIZE_CHOICES.find((n) => n === value) ?? DEFAULT_PAGE_SIZE;
}

/** Page numbers to show as buttons: the first, the last and a few around the current one; null is a gap. */
export function pageButtons(page: number, pages: number): Array<number | null> {
  const wanted = new Set([0, pages - 1, page - 1, page, page + 1]);
  const shown = [...wanted].filter((p) => p >= 0 && p < pages).sort((a, b) => a - b);
  const out: Array<number | null> = [];
  shown.forEach((p, i) => {
    if (i > 0 && p - shown[i - 1] > 1) out.push(null);
    out.push(p);
  });
  return out;
}
