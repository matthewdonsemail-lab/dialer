import type React from "react";
import { cn } from "@/lib/utils";

/**
 * A pulsing placeholder block, the one skeleton colour and motion in the app.
 * Size it with width/height classes (or `style` for computed sizes).
 */
export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      aria-hidden="true"
      style={style}
      className={cn("animate-pulse rounded-[4px] bg-[var(--ods-border)]", className)}
    />
  );
}

/** Deterministic widths so rows look varied without jumping between renders. */
const BAR_WIDTHS = ["w-3/4", "w-1/2", "w-2/3", "w-5/6", "w-2/5", "w-3/5"];

/**
 * Placeholder `<tr>`s for a table body. Matches the 36px data rows, so the
 * table keeps its shape while data loads. `leadingCheckbox` / `trailingActions`
 * mirror the selection and actions columns of the record tables.
 */
export function TableSkeletonRows({
  rows = 12,
  columns,
  leadingCheckbox = false,
  trailingActions = false,
  bordered = false,
}: {
  rows?: number;
  columns: number;
  leadingCheckbox?: boolean;
  trailingActions?: boolean;
  bordered?: boolean;
}) {
  const cell = cn("h-9 px-3", bordered && "border-b border-r first:border-l border-[var(--ods-border)]");
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} className="h-9" aria-hidden="true">
          {leadingCheckbox && (
            <td className={cn(cell, "px-0")}>
              <Skeleton className="h-3.5 w-3.5 mx-auto rounded-[3px]" />
            </td>
          )}
          {Array.from({ length: columns }, (_, c) => (
            <td key={c} className={cell}>
              <Skeleton className={cn("h-3", BAR_WIDTHS[(r + c * 2) % BAR_WIDTHS.length])} />
            </td>
          ))}
          {trailingActions && (
            <td className={cell}>
              <div className="flex justify-end gap-1.5">
                <Skeleton className="h-3.5 w-3.5" />
                <Skeleton className="h-3.5 w-3.5" />
              </div>
            </td>
          )}
        </tr>
      ))}
    </>
  );
}

/** A widget-card-shaped placeholder with a title and a few text lines. */
export function CardSkeleton({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-[8px] border border-[var(--ods-border)] bg-[var(--ods-bg-primary)] p-4 space-y-3",
        className,
      )}
    >
      <Skeleton className="h-3.5 w-1/3" />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn("h-3", BAR_WIDTHS[i % BAR_WIDTHS.length])} />
      ))}
    </div>
  );
}

/** Record detail page: back arrow, name and badges, then widget cards. */
export function DetailPageSkeleton() {
  return (
    <div className="p-6 space-y-6" role="status" aria-label="Loading">
      <div className="flex items-center gap-3">
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-5 w-20 rounded-md" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <CardSkeleton lines={6} className="lg:col-span-2" />
        <CardSkeleton lines={6} />
        <CardSkeleton lines={4} />
        <CardSkeleton lines={4} className="lg:col-span-2" />
      </div>
    </div>
  );
}
