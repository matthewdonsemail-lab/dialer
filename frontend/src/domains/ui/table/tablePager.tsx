import { Button } from "@/domains/ui/button";
import { ChevronDown, ChevronLeft, ChevronRight } from "@/domains/ui/icons";
import { SelectMenu } from "@/domains/ui/menu";
import { PAGE_SIZE_CHOICES, pageButtons, pageCount } from "./pager";

/**
 * The footer under a paged table: "Page 1 of 6", the rows-per-page choice,
 * and Prev / page numbers / Next. Page is zero-based.
 */
export function TablePager({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  page: number;
  pageSize: number;
  total: number | null;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}) {
  const pages = pageCount(total ?? 0, pageSize);
  const current = Math.min(page, pages - 1);
  const first = (total ?? 0) === 0 ? 0 : current * pageSize + 1;
  const last = Math.min(total ?? 0, (current + 1) * pageSize);
  return (
    <div className="h-12 px-4 flex items-center justify-between gap-3 border-t border-[var(--ods-border)] shrink-0 overflow-x-auto whitespace-nowrap no-scrollbar">
      <span className="text-[13px] text-[var(--ods-text-secondary)] tabular-nums">
        Page {current + 1} of {pages}
        {total != null && <span className="text-[var(--ods-text-tertiary)]"> · {first.toLocaleString()}–{last.toLocaleString()} of {total.toLocaleString()}</span>}
      </span>
      <div className="flex items-center gap-2">
        <SelectMenu
          value={String(pageSize)}
          onChange={(v) => onPageSize(Number(v))}
          width={160}
          placement="top-end"
          sections={[{ title: "Rows per page", options: PAGE_SIZE_CHOICES.map((n) => ({ value: String(n), label: `${n} per page` })) }]}
          triggerTitle="How many contacts to show on each page"
          triggerClassName="h-8 px-3 inline-flex items-center gap-1.5 rounded-[8px] border border-[var(--ods-border-strong)] text-[13px] font-semibold text-[var(--ods-text-primary)] hover:bg-[var(--ods-hover)]"
          trigger={
            <>
              {pageSize}
              <ChevronDown className="w-3 h-3 opacity-60" />
            </>
          }
        />
        <Button size="sm" icon={ChevronLeft} aria-label="Previous page" disabled={current === 0} onClick={() => onPage(current - 1)}>
          Prev
        </Button>
        {pageButtons(current, pages).map((p, i) =>
          p === null ? (
            <span key={`gap-${i}`} className="px-1 text-[var(--ods-text-tertiary)]" aria-hidden="true">
              …
            </span>
          ) : (
            <Button key={p} size="sm" pressed={p === current} aria-label={`Page ${p + 1}`} aria-current={p === current ? "page" : undefined} onClick={() => onPage(p)}>
              {p + 1}
            </Button>
          ),
        )}
        <Button size="sm" aria-label="Next page" disabled={current >= pages - 1} onClick={() => onPage(current + 1)}>
          Next
          <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
