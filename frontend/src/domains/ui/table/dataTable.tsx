import React, { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { buttonClass } from "@/domains/ui/button";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import { GripVertical, Search, X } from "@/domains/ui/icons";
import { ColumnVisibilityDropdown } from "./columnVisibilityDropdown";
import { HeaderFilter, type HeaderFilterOption } from "./headerFilter";
import { RecordIndexCommandMenu } from "./recordIndexCommandMenu";
import { ColumnResizeHandle, SortableHeaderCell } from "./sortableHeaderCell";
import { Skeleton, TableSkeletonRows } from "@/domains/ui/skeleton";
import { SectionTitle } from "@/domains/ui/sectionTitle";
import type { TipSpec } from "@/domains/ui/infoTip";
import { useColumnOrder } from "./useColumnOrder";
import { useColumnWidths } from "./useColumnWidths";
import { sortRows, type SortDirection } from "./listSort";
import {
  CELL_TYPE_CLASS,
  DEFAULT_COLUMN_WIDTH,
  isBlank,
  renderTyped,
  sortValueFor,
  textFor,
  type BadgeTone,
  type ColumnType,
} from "./columnTypes";
import type { DataTableState } from "./useDataTable";

export interface DataColumn<T> {
  key: string;
  label: string;
  type: ColumnType;
  /** The raw value. Drives default rendering, sorting, search and filter options. */
  value: (row: T) => unknown;
  /** Display text when it differs from the raw value (a status label, a campaign name). */
  text?: (row: T) => string | null | undefined;
  /** Replaces the default rendering, e.g. an inline status editor. */
  render?: (row: T) => ReactNode;
  /** Badge colour for `badge` columns. */
  tone?: (row: T) => BadgeTone;
  /** Initial width in px; defaults by type. */
  width?: number;
  sortable?: boolean;
  /** Offer the column's values as a filter in its header menu. */
  filterable?: boolean;
  /**
   * The value the header filter groups by, when it should differ from the
   * displayed text (e.g. duration buckets, "Has recording"). Display and
   * sorting are unaffected. Return null to leave a row out of every option.
   */
  filterValue?: (row: T) => string | null | undefined;
  /** Fixed order for the header filter options (default: most common first). */
  filterOrder?: string[];
  /** Leading visual for each value in the header filter menu, e.g. a country flag. */
  filterIcon?: (value: string) => ReactNode;
  /** Clicking the cell runs this (typically opens the record). */
  onClick?: (row: T) => void;
  /** Extra header content after the label, e.g. a Twenty settings link. */
  headerExtra?: ReactNode;
}

/**
 * Server mode, modelled on Twenty's virtualized record table: the page knows
 * the total and serves rows by index (fetched in windows by offset). The
 * table sizes its body to the full list, renders only the rows in view plus
 * an overscan, shows skeleton rows for any not loaded yet, and reports the
 * visible range so the page can fetch it. Search, filters and sort run on the
 * server (from `state`).
 */
export interface ServerPaging<T = unknown> {
  total: number | null;
  /** The row at an index, or undefined while it is loading. */
  rowAt: (index: number) => T | undefined;
  /** Called (debounced) with the first and last row index in view, overscan included. */
  onRangeChange: (first: number, last: number) => void;
  /** Header-filter options per column key (values + counts from the server). */
  facets?: Record<string, HeaderFilterOption[]>;
}

interface DataTableProps<T> {
  state: DataTableState;
  /** Rows come from the server by index; see ServerPaging. */
  server?: ServerPaging<T>;
  title: string;
  /** Eye tooltip beside the title explaining what this list is. */
  info?: TipSpec;
  columns: DataColumn<T>[];
  rows: T[] | undefined;
  loading?: boolean;
  getRowId: (row: T) => string;
  /** Page-level filters (toolbar dropdowns, tabs), applied before search and column filters. */
  filter?: (row: T) => boolean;
  /** Extra searchable text beyond the columns (email, country). */
  searchText?: (row: T) => string;
  /** Rows that always sort to the bottom, whatever the column sort. */
  isBottom?: (row: T) => boolean;
  /** Order used when no column sort is chosen. */
  defaultSort?: { key: string; direction: SortDirection };
  /** Toolbar controls between search and the column menu. */
  filters?: ReactNode;
  /** Toolbar buttons at the far right (Sync, New). */
  actions?: ReactNode;
  /** A row under the toolbar, e.g. campaign tabs. */
  subheader?: ReactNode;
  rowActions?: (row: T) => ReactNode;
  onRowClick?: (row: T) => void;
  /** Content shown in a full-width row under a row, or null. */
  renderExpanded?: (row: T) => ReactNode;
  /**
   * Enables row checkboxes and the bulk action bar. `actions` renders extra
   * buttons while rows are selected; ids are in the order shown.
   */
  selection?: {
    onDelete: (ids: string[]) => void | Promise<void>;
    actions?: (ids: string[], clear: () => void) => ReactNode;
  };
  emptyMessage: ReactNode;
  /** Clears the page's own filters; called with the table's when "Clear filters" is used. */
  onClearFilters?: () => void;
}

const CELL = "h-9 px-3 border-b border-r first:border-l border-[var(--ods-border)] whitespace-nowrap overflow-hidden text-ellipsis text-[13px]";
const HEAD = "group/th relative px-3 whitespace-nowrap text-[13px] font-medium text-[var(--ods-text-primary)] border-y border-r first:border-l border-[var(--ods-border)] bg-[var(--ods-bg-secondary)]";

/** Plain text for a cell: what search matches, filters list, and text columns sort by. */
function cellText<T>(col: DataColumn<T>, row: T): string {
  return col.text ? (col.text(row) ?? "") : textFor(col.type, col.value(row));
}

function filterText<T>(col: DataColumn<T>, row: T): string {
  return col.filterValue ? (col.filterValue(row) ?? "") : cellText(col, row);
}

function cellSortValue<T>(col: DataColumn<T>, row: T): string | number | null {
  if (col.text) {
    const t = col.text(row);
    return isBlank(t) ? null : (t as string);
  }
  return sortValueFor(col.type, col.value(row));
}

/**
 * The one table used by every list page. Columns are typed (see
 * column-types.tsx); the table supplies the toolbar, search, sortable and
 * filterable headers, drag-to-reorder, resize, column visibility, selection,
 * skeleton loading and empty states. Layout and filters persist per table.
 */
export function DataTable<T>({
  state,
  title,
  info,
  columns,
  rows,
  loading = false,
  getRowId,
  filter,
  searchText,
  isBottom,
  defaultSort,
  filters,
  actions,
  subheader,
  rowActions,
  onRowClick,
  renderExpanded,
  selection,
  emptyMessage,
  onClearFilters,
  server,
}: DataTableProps<T>) {
  const { tableId, search, setSearch, sort, setSort, columnFilters, setColumnFilter } = state;
  const pinnedKey = columns[0]?.key;
  const byKey = useMemo(() => new Map(columns.map((c) => [c.key, c])), [columns]);

  // ---- layout: order, visibility, widths (persisted per table) ----
  const { columns: layout, setColumns: setLayout } = useColumnOrder(
    `${tableId}-column-order`,
    columns.map((c) => ({ key: c.key, label: c.label, visible: true })),
    pinnedKey,
  );
  const visible = layout.filter((c) => c.visible && byKey.has(c.key)).map((c) => byKey.get(c.key)!);
  const pinned = visible[0]?.key === pinnedKey ? visible[0] : undefined;
  const movable = pinned ? visible.slice(1) : visible;
  const movableKeys = movable.map((c) => c.key);

  const { widths, setWidth } = useColumnWidths(
    `${tableId}-column-widths`,
    Object.fromEntries(columns.map((c) => [c.key, c.width ?? DEFAULT_COLUMN_WIDTH[c.type]])),
  );
  // Columns share the table width in proportion to their widths (unitless
  // weights), so every column fits on screen like a GoHighLevel contact list
  // instead of scrolling sideways. Resizing changes a column's weight.
  const fixedPx = (selection ? 40 : 0) + (rowActions ? 72 : 0);
  const totalWeight = visible.reduce((sum, c) => sum + (widths[c.key] ?? DEFAULT_COLUMN_WIDTH[c.type]), 0) || 1;
  const tableVars = {
    ...Object.fromEntries(Object.entries(widths).map(([k, v]) => [`--col-${k}`, String(v)])),
    "--col-total": String(totalWeight),
    "--col-fixed": `${fixedPx}px`,
    // Below ~90px a column is unreadable; only then fall back to scrolling.
    minWidth: `${visible.length * 90 + fixedPx}px`,
  } as React.CSSProperties;

  // While a column is dragged nothing in the body changes, so reuse the last
  // rendered <tbody> element: React skips identical elements, which keeps
  // dragging smooth on long lists instead of re-rendering every row per move.
  const bodyCache = useRef<ReactNode>(null);
  const frozenBody = (dragging: boolean, render: () => ReactNode) => {
    if (!dragging || bodyCache.current === null) bodyCache.current = render();
    return bodyCache.current;
  };

  // ---- header drag (x-axis, first column pinned) with blue insertion edge ----
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 3 } }));
  const [activeId, setActiveId] = useState<string | null>(null);
  // Size of the grabbed header, so the drag preview is an exact copy of it.
  const [activeSize, setActiveSize] = useState<{ width: number; height: number } | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [edge, setEdge] = useState<"left" | "right" | null>(null);
  const pointerX = useRef(0);
  const tableRef = useRef<HTMLTableElement>(null);
  const headerEls = useRef(new Map<string, HTMLElement>());
  const registerHeader = (key: string) => (el: HTMLElement | null) => {
    if (el) headerEls.current.set(key, el);
    else headerEls.current.delete(key);
  };
  const clearDnD = () => {
    setActiveId(null);
    setActiveSize(null);
    setOverId(null);
    setEdge(null);
  };
  const handleDragOver = (e: DragOverEvent) => {
    const id = e.over ? String(e.over.id) : null;
    setOverId(id);
    const el = id ? headerEls.current.get(id) : undefined;
    if (!el) return setEdge(null);
    const r = el.getBoundingClientRect();
    setEdge(pointerX.current < r.left + r.width / 2 ? "left" : "right");
  };
  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (over && active.id !== over.id) {
      const from = movableKeys.indexOf(String(active.id));
      const to = movableKeys.indexOf(String(over.id));
      if (from >= 0 && to >= 0) {
        const nextOrder = arrayMove(movableKeys, from, to);
        setLayout((prev) => {
          // Reorder the visible movable columns; hidden ones keep their place at the end.
          const map = new Map(prev.map((c) => [c.key, c]));
          const head = prev.filter((c) => c.key === pinnedKey);
          const hidden = prev.filter((c) => c.key !== pinnedKey && !nextOrder.includes(c.key));
          return [...head, ...nextOrder.map((k) => map.get(k)!), ...hidden];
        });
      }
    }
    clearDnD();
  };

  // ---- rows: page filter -> column filters -> search -> sort ----
  const pageRows = useMemo(() => (rows ?? []).filter((r) => !filter || filter(r)), [rows, filter]);

  const facets = useMemo(() => {
    const out = new Map<string, HeaderFilterOption[]>();
    if (server) {
      for (const col of columns) {
        const opts = server.facets?.[col.key];
        if (col.filterable && opts) out.set(col.key, opts.map((o) => ({ ...o, icon: o.icon ?? col.filterIcon?.(o.value) })));
      }
      return out;
    }
    for (const col of columns) {
      if (!col.filterable) continue;
      const counts = new Map<string, number>();
      for (const r of rows ?? []) {
        const t = filterText(col, r);
        if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
      }
      const order = col.filterOrder;
      const rank = (v: string) => (order ? (order.indexOf(v) === -1 ? order.length : order.indexOf(v)) : 0);
      out.set(
        col.key,
        [...counts.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || b[1] - a[1]).map(([value, count]) => ({ value, label: value, count, icon: col.filterIcon?.(value) })),
      );
    }
    return out;
  }, [columns, rows, server]);

  const shownRows = useMemo(() => {
    // The server already searched, filtered and sorted this page.
    if (server) return pageRows;
    const q = search.trim().toLowerCase();
    const filtered = pageRows.filter((r) => {
      for (const [key, value] of Object.entries(columnFilters)) {
        const col = byKey.get(key);
        if (col && filterText(col, r) !== value) return false;
      }
      if (!q) return true;
      if (searchText && searchText(r).toLowerCase().includes(q)) return true;
      return columns.some((c) => cellText(c, r).toLowerCase().includes(q));
    });
    const activeSort = sort && byKey.has(sort.key) ? sort : (defaultSort ?? null);
    return sortRows(filtered, {
      sort: activeSort,
      isBottom: isBottom ?? (() => false),
      valueOf: (r, key) => {
        const col = byKey.get(key);
        return col ? cellSortValue(col, r) : null;
      },
    });
  }, [pageRows, columnFilters, search, searchText, columns, byKey, sort, defaultSort, isBottom, server]);

  // ---- server mode: virtual rows (Twenty-style) ----
  // Only rows in view plus OVERSCAN either side are in the DOM; spacer rows
  // stand in for the rest so the scrollbar reflects the whole list.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [rowHeight, setRowHeight] = useState(36);
  const [viewport, setViewport] = useState({ top: 0, height: 800 });
  const OVERSCAN = 20;
  const total = server?.total ?? 0;
  const firstRow = server ? Math.max(0, Math.floor(viewport.top / rowHeight) - OVERSCAN) : 0;
  const lastRow = server ? Math.min(Math.max(0, total - 1), Math.ceil((viewport.top + viewport.height) / rowHeight) + OVERSCAN) : 0;

  useEffect(() => {
    const el = scrollRef.current;
    if (!server || !el) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const head = el.querySelector("thead")?.getBoundingClientRect().height ?? 0;
        setViewport({ top: Math.max(0, el.scrollTop - head), height: el.clientHeight });
        const sample = el.querySelector<HTMLTableRowElement>("tbody tr[data-row]");
        if (sample && sample.offsetHeight > 0) setRowHeight((h) => (h === sample.offsetHeight ? h : sample.offsetHeight));
      });
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [!!server]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ask for the visible window once scrolling settles a moment (Twenty waits 300ms; 120ms feels snappier).
  const onRange = server?.onRangeChange;
  useEffect(() => {
    if (!onRange) return;
    const t = setTimeout(() => onRange(firstRow, lastRow), 120);
    return () => clearTimeout(t);
  }, [onRange, firstRow, lastRow]);

  // A new search / filter / sort starts back at the top.
  const queryKey = JSON.stringify([search, columnFilters, sort]);
  useEffect(() => {
    if (server && scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [queryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- selection ----
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const allSelected = shownRows.length > 0 && shownRows.every((r) => selectedIds.has(getRowId(r)));
  const toggleAll = () => setSelectedIds(allSelected ? new Set() : new Set(shownRows.map(getRowId)));
  const toggleRow = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const clearAllFilters = () => {
    state.clear();
    onClearFilters?.();
  };

  // ---- header menus: sort + optional value filter ----
  const headerMenu = (col: DataColumn<T>) => {
    const sortable = col.sortable !== false;
    if (!sortable && !col.filterable) return undefined;
    return (
      <HeaderFilter
        label={col.label}
        value={col.filterable ? (columnFilters[col.key] ?? "all") : undefined}
        options={col.filterable ? (facets.get(col.key) ?? []) : undefined}
        onChange={(v) => setColumnFilter(col.key, v)}
        sort={
          sortable
            ? {
                direction: sort?.key === col.key ? sort.direction : null,
                onSort: (direction) => setSort(direction ? { key: col.key, direction } : null),
              }
            : undefined
        }
      />
    );
  };

  const columnCount = visible.length + (selection ? 1 : 0) + (rowActions ? 1 : 0);

  const renderCell = (col: DataColumn<T>, row: T) => {
    const content = col.render ? col.render(row) : renderTyped(col.type, col.value(row), col.tone?.(row));
    const clickable = !!col.onClick;
    return (
      <td
        key={col.key}
        className={`${CELL} ${CELL_TYPE_CLASS[col.type]} ${
          clickable ? "cursor-pointer hover:text-[var(--ods-brand-600)] hover:underline underline-offset-2" : ""
        }`}
        onClick={
          clickable
            ? (e) => {
                e.stopPropagation();
                col.onClick!(row);
              }
            : undefined
        }
      >
        {content}
      </td>
    );
  };

  const selecting = selection && selectedIds.size > 0;

  /** One data row (plus its expanded row), shared by the client and server bodies. */
  const renderRow = (row: T) => {
                  const id = getRowId(row);
                  const selected = selectedIds.has(id);
                  const expanded = renderExpanded?.(row);
                  return (
                    <React.Fragment key={id}>
                      <tr
                        data-row
                        onClick={onRowClick ? () => onRowClick(row) : undefined}
                        className={`h-9 transition-colors ${onRowClick ? "cursor-pointer" : ""} ${
                          selected ? "bg-[var(--ods-bg-secondary)]" : "hover:bg-[var(--ods-bg-secondary)]"
                        }`}
                      >
                        {selection && (
                          <td className="h-9 p-0 text-center border-b border-r first:border-l border-[var(--ods-border)]" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleRow(id)}
                              aria-label="Select row"
                              className="m-0 align-middle rounded-md border-[var(--ods-border)] accent-[var(--ods-brand-600)]"
                            />
                          </td>
                        )}
                        {visible.map((col) => renderCell(col, row))}
                        {rowActions && (
                          <td className={`${CELL} text-right`} onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1">{rowActions(row)}</div>
                          </td>
                        )}
                      </tr>
                      {expanded && (
                        <tr>
                          <td colSpan={columnCount} className="px-3 py-3 border-b border-x border-[var(--ods-border)] bg-[var(--ods-bg-secondary)]">
                            {expanded}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                  };

  /** Placeholder row while its window loads: the same bars as the first-load skeleton. */
  const skeletonRow = (index: number) => (
    <tr key={`skeleton-${index}`} data-row className="h-9">
      {selection && (
        <td className="h-9 p-0 border-b border-r first:border-l border-[var(--ods-border)]">
          <Skeleton className="h-3.5 w-3.5 mx-auto rounded-md" />
        </td>
      )}
      {visible.map((col, i) => (
        <td key={col.key} className={CELL}>
          <Skeleton className="h-3" style={{ width: `${45 + ((index * 7 + i * 13) % 45)}%` }} />
        </td>
      ))}
      {rowActions && <td className={CELL} />}
    </tr>
  );

  /** Server mode body: spacer, the rows in view (or skeletons), spacer. */
  const serverBody = () => {
    if (!server) return null;
    if (server.total == null || (loading && total === 0)) {
      return <TableSkeletonRows rows={30} columns={visible.length} leadingCheckbox={!!selection} trailingActions={!!rowActions} bordered />;
    }
    if (total === 0) {
      return (
        <tr>
          <td colSpan={columnCount} className="text-center py-8 text-[13px] text-[var(--ods-text-secondary)]">
            {state.hasActiveFilters ? (
              <>
                Nothing matches these filters.{" "}
                <button onClick={clearAllFilters} className="text-[var(--ods-brand-600)] hover:underline font-medium">
                  Clear filters
                </button>
              </>
            ) : (
              emptyMessage
            )}
          </td>
        </tr>
      );
    }
    const out: ReactNode[] = [];
    if (firstRow > 0) out.push(<tr key="spacer-top" aria-hidden="true" style={{ height: firstRow * rowHeight }} />);
    for (let i = firstRow; i <= lastRow; i++) {
      const row = server.rowAt(i);
      out.push(row ? renderRow(row) : skeletonRow(i));
    }
    const below = total - 1 - lastRow;
    if (below > 0) out.push(<tr key="spacer-bottom" aria-hidden="true" style={{ height: below * rowHeight }} />);
    return out;
  };

  return (
    <div className="flex flex-col h-full w-full select-none bg-[var(--ods-bg-primary)]">
      {/* Toolbar */}
      <div className="h-14 px-4 flex items-center justify-between gap-3 border-b border-[var(--ods-border)] shrink-0 overflow-x-auto whitespace-nowrap no-scrollbar">
        <div className="flex items-center gap-2">
          <SectionTitle as="h2" title={title} pill={
              selecting
                ? `${selectedIds.size} selected`
                : // Count unknown while the first load is in flight: a placeholder, never a misleading "0".
                  (server ? server.total == null : loading)
                  ? <Skeleton className="h-3 w-6" />
                  : server
                    ? server.total!.toLocaleString()
                    : String(shownRows.length)
            } info={info} />
        </div>
        {selecting ? (
          <div className="flex items-center gap-2">
          {selection!.actions?.(
            shownRows.map(getRowId).filter((id) => selectedIds.has(id)),
            () => setSelectedIds(new Set()),
          )}
          <RecordIndexCommandMenu
            selectedCount={selectedIds.size}
            onClear={() => setSelectedIds(new Set())}
            onDelete={async () => {
              await selection!.onDelete([...selectedIds]);
              setSelectedIds(new Set());
            }}
          />
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="relative shrink-0">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--ods-text-tertiary)] pointer-events-none" />
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-7 w-44 pl-7 pr-7 text-[12px] border border-[var(--ods-border)] rounded-md bg-[var(--ods-bg-primary)] text-[var(--ods-text-primary)] placeholder:text-[var(--ods-text-tertiary)] outline-none focus:border-[var(--ods-brand-500)]"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  title="Clear search"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--ods-text-tertiary)] hover:text-[var(--ods-text-primary)]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {filters}
            <ColumnVisibilityDropdown
              columns={layout.filter((c) => byKey.has(c.key))}
              onChange={(key, isVisible) =>
                setLayout((prev) => prev.map((c) => (c.key === key ? { ...c, visible: isVisible } : c)))
              }
            />
            {actions}
          </div>
        )}
      </div>

      {subheader && (
        <div className="px-3 py-1.5 flex items-center gap-1.5 border-b border-[var(--ods-border)] overflow-x-auto shrink-0 no-scrollbar">
          {subheader}
        </div>
      )}

      <div ref={scrollRef} className="flex-1 w-full overflow-auto no-scrollbar">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToHorizontalAxis]}
          onDragStart={(e) => {
            const id = String(e.active.id);
            const r = headerEls.current.get(id)?.getBoundingClientRect();
            setActiveSize(r ? { width: r.width, height: r.height } : null);
            setActiveId(id);
          }}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={clearDnD}
        >
          {/*
            Separate (not collapsed) borders: collapsed borders belong to the
            table grid, so a sticky header loses its edges and rows show
            through above it while scrolling. Each cell draws its own
            right/bottom edge; the first column and header add left/top.
          */}
          <table ref={tableRef} className="w-full border-separate border-spacing-0 text-left table-fixed" style={tableVars}>
            <colgroup>
              {selection && <col style={{ width: 40 }} />}
              {visible.map((c) => (
                <col key={c.key} style={{ width: `calc((100% - var(--col-fixed)) * var(--col-${c.key}) / var(--col-total))` }} />
              ))}
              {rowActions && <col style={{ width: 72 }} />}
            </colgroup>
            <thead
              className="sticky top-0 bg-[var(--ods-bg-secondary)] z-10"
              onPointerMove={(e) => {
                pointerX.current = e.clientX;
              }}
            >
              <tr className="h-9">
                {selection && (
                  <th className="p-0 text-center border-y border-r first:border-l border-[var(--ods-border)] bg-[var(--ods-bg-secondary)]">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Select all"
                      className="m-0 align-middle rounded-md border-[var(--ods-border)] accent-[var(--ods-brand-600)]"
                    />
                  </th>
                )}
                {pinned && (
                  <th className={HEAD}>
                    <span className="inline-flex items-center">
                      {pinned.label}
                      {pinned.headerExtra}
                      {headerMenu(pinned)}
                    </span>
                    <ColumnResizeHandle
                      colKey={pinned.key}
                      tableRef={tableRef}
                      startWidth={widths[pinned.key] ?? DEFAULT_COLUMN_WIDTH[pinned.type]}
                      onResizeEnd={setWidth}
                    />
                  </th>
                )}
                <SortableContext items={movableKeys} strategy={horizontalListSortingStrategy}>
                  {movable.map((col) => (
                    <SortableHeaderCell
                      key={col.key}
                      colKey={col.key}
                      label={col.label}
                      edge={overId === col.key ? edge : null}
                      registerHeader={registerHeader}
                      filter={headerMenu(col)}
                      settingsLink={col.headerExtra}
                      resizeHandle={
                        <ColumnResizeHandle
                          colKey={col.key}
                          tableRef={tableRef}
                          startWidth={widths[col.key] ?? DEFAULT_COLUMN_WIDTH[col.type]}
                          onResizeEnd={setWidth}
                        />
                      }
                    />
                  ))}
                </SortableContext>
                {rowActions && <th className={`${HEAD} text-right`}>Actions</th>}
              </tr>
            </thead>
            {frozenBody(activeId !== null, () => (
            <tbody>
              {server ? (
                serverBody()
              ) : loading ? (
                <TableSkeletonRows
                  rows={30}
                  columns={visible.length}
                  leadingCheckbox={!!selection}
                  trailingActions={!!rowActions}
                  bordered
                />
              ) : (rows ?? []).length === 0 ? (
                <tr>
                  <td colSpan={columnCount} className="text-center py-8 text-[13px] text-[var(--ods-text-secondary)]">
                    {emptyMessage}
                  </td>
                </tr>
              ) : shownRows.length === 0 ? (
                <tr>
                  <td colSpan={columnCount} className="text-center py-8 text-[13px] text-[var(--ods-text-secondary)]">
                    Nothing matches these filters.{" "}
                    <button onClick={clearAllFilters} className="text-[var(--ods-brand-600)] hover:underline font-medium">
                      Clear filters
                    </button>
                  </td>
                </tr>
              ) : (
                shownRows.map(renderRow)
              )}
            </tbody>
            ))}
          </table>
          {/* Portalled to <body> so mounting the preview never re-lays-out the big table. */}
          {createPortal(
          <DragOverlay dropAnimation={null}>
            {activeId ? (
              // An exact copy of the header cell (grip, label, links, menu),
              // square and a shade darker so it reads as the one being moved.
              <div
                style={activeSize ?? undefined}
                className="pointer-events-none flex items-center px-3 whitespace-nowrap overflow-hidden text-[13px] font-medium text-[var(--ods-text-primary)] border border-[var(--ods-border-strong)] bg-[var(--ods-bg-tertiary)] shadow-[0_6px_16px_rgba(0,0,0,0.14)] cursor-grabbing"
              >
                <span className="mr-1 inline-flex text-[var(--ods-text-primary)]">
                  <GripVertical className="w-3.5 h-3.5" />
                </span>
                {byKey.get(activeId)?.label ?? activeId}
                {byKey.get(activeId)?.headerExtra}
                {byKey.get(activeId) && headerMenu(byKey.get(activeId)!)}
              </div>
            ) : null}
          </DragOverlay>,
          document.body,
          )}
        </DndContext>
      </div>
    </div>
  );
}

/** A filter tab for a table's subheader row (campaign tabs). */
export function TableTab({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`h-7 px-2.5 shrink-0 rounded-md text-[12px] font-medium border transition-colors flex items-center gap-1.5 ${
        active
          ? "bg-[var(--ods-brand-600)] border-[var(--ods-brand-600)] text-white"
          : "border-[var(--ods-border)] text-[var(--ods-text-secondary)] hover:text-[var(--ods-text-primary)] hover:bg-[var(--ods-bg-secondary)]"
      }`}
    >
      <span className="max-w-[160px] truncate">{label}</span>
      <span className={`text-[12px] tabular-nums px-1 rounded-md ${active ? "bg-white/20" : "bg-[var(--ods-bg-secondary)]"}`}>
        {count}
      </span>
    </button>
  );
}

/** A toolbar button with the shared look (Sync, New ...). */
export function ToolbarButton({
  children,
  onClick,
  disabled,
  primary = false,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  const variant = primary ? "primary" : "secondary";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={buttonClass({ variant, size: "sm" })}
    >
      {children}
    </button>
  );
}
