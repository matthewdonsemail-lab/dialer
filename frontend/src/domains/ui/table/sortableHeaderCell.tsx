import { useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "@/domains/ui/icons";
import { MIN_COLUMN_WIDTH } from "./useColumnWidths";

/**
 * Twenty-style sortable header cell: the grip is the drag activator (whole
 * cell never starts a drag, so clicks/selects keep working), dnd-kit slides
 * siblings via transform, and the parent draws the blue insertion edge.
 */
export function SortableHeaderCell({
  colKey,
  label,
  edge,
  resizeHandle,
  registerHeader,
  filter,
  settingsLink,
}: {
  colKey: string;
  label: string;
  edge?: "left" | "right" | null;
  resizeHandle?: React.ReactNode;
  registerHeader: (key: string) => (el: HTMLElement | null) => void;
  /** Optional header filter button (e.g. HeaderFilter) rendered after the label */
  filter?: React.ReactNode;
  /** Optional Twenty settings deep-link (e.g. TwentyFieldLink) after the label */
  settingsLink?: React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: colKey });

  return (
    <th
      ref={(el) => {
        setNodeRef(el);
        registerHeader(colKey)(el);
      }}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        ...(edge === "left"
          ? { boxShadow: "inset 2px 0 0 var(--ods-brand-600)" }
          : edge === "right"
            ? { boxShadow: "inset -2px 0 0 var(--ods-brand-600)" }
            : undefined),
      }}
      className={`group/th relative px-3 whitespace-nowrap text-[13px] font-medium text-[var(--ods-text-primary)] border-y border-r first:border-l border-[var(--ods-border)] bg-[var(--ods-bg-secondary)] ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <span className="inline-flex items-center">
        <span
          {...attributes}
          {...listeners}
          className="mr-1 inline-flex cursor-grab active:cursor-grabbing text-[var(--ods-text-tertiary)] hover:text-[var(--ods-text-primary)] align-middle touch-none"
          title="Drag to reorder column"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </span>
        {label}
        {settingsLink}
        {filter}
      </span>
      {resizeHandle}
    </th>
  );
}

/**
 * Twenty-style edge resize handle: absolute strip on the cell's right edge.
 * Dragging mutates `--col-<key>` on the table element directly (no React
 * re-render); the final width persists on pointer-up. Blue line while active.
 */
export function ColumnResizeHandle({
  colKey,
  tableRef,
  startWidth,
  onResizeEnd,
}: {
  colKey: string;
  tableRef: React.RefObject<HTMLTableElement | null>;
  startWidth: number;
  onResizeEnd: (key: string, px: number) => void;
}) {
  const [isResizing, setIsResizing] = useState(false);
  const drag = useRef<{ startX: number; startW: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { startX: e.clientX, startW: startWidth };
    setIsResizing(true);

    const onMove = (ev: PointerEvent) => {
      const d = drag.current;
      const table = tableRef.current;
      if (!d || !table) return;
      const next = Math.max(MIN_COLUMN_WIDTH, d.startW + (ev.clientX - d.startX));
      // Unitless: DataTable turns column weights into shares of the table width.
      table.style.setProperty(`--col-${colKey}`, String(next));
    };
    const onUp = (ev: PointerEvent) => {
      const d = drag.current;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setIsResizing(false);
      if (d) onResizeEnd(colKey, Math.max(MIN_COLUMN_WIDTH, d.startW + (ev.clientX - d.startX)));
      drag.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <span
      role="separator"
      aria-orientation="vertical"
      onPointerDown={onPointerDown}
      className="absolute top-0 bottom-0 -right-[5px] w-[10px] z-[1] cursor-col-resize"
      style={{ touchAction: "none" }}
    >
      {isResizing && (
        <span className="absolute top-0 bottom-0 right-[4px] w-[2px] bg-[var(--ods-brand-600)]" />
      )}
    </span>
  );
}
