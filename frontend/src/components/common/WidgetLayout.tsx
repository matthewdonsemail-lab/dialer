import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, Eye, EyeOff, GripVertical, RotateCcw, SlidersHorizontal } from "lucide-react";

/**
 * Draggable, hideable widget grid for the Lead / Prospect detail pages.
 *
 * Usage:
 *   <WidgetLayout storageKey="dialer:layout:lead-detail">
 *     <WidgetSlot id="softphone" title="Softphone" span={4}>...</WidgetSlot>
 *     <WidgetSlot id="script" title="Call Script" span={4}>...</WidgetSlot>
 *   </WidgetLayout>
 *
 * - Drag by the grip (the slot body never starts a drag, so widgets keep
 *   working normally). Only the grip starts a drag — same pattern as the
 *   table column headers (see SortableHeaderCell).
 * - The eye button hides a slot; hidden slots park in the toolbar tray and
 *   can be restored. Order + visibility persist to localStorage per page.
 * - Reordering keeps stable React keys, so widget state (e.g. a live call)
 *   survives a move. Hiding unmounts, so slots can opt out via `lockHide`
 *   (used for the softphone: hiding it mid-call would drop the call UI).
 * - Conditional slots (e.g. Recent Calls with zero calls) simply render or
 *   not; unknown ids are appended, stale stored ids are ignored.
 */

interface LayoutState {
  order: string[];
  hidden: string[];
}

interface SlotInfo {
  id: string;
  title: string;
}

const LayoutContext = createContext<{
  customizing: boolean;
  hideSlot: (id: string) => void;
}>({ customizing: false, hideSlot: () => {} });

// Literal class names only — Tailwind JIT cannot see interpolated spans.
const SPAN_CLASSES: Record<number, string> = {
  3: "lg:col-span-3",
  4: "lg:col-span-4",
  6: "lg:col-span-6",
  8: "lg:col-span-8",
  12: "lg:col-span-12",
};

function loadState(storageKey: string): LayoutState | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LayoutState>;
    if (!Array.isArray(parsed.order) || !Array.isArray(parsed.hidden)) return null;
    return {
      order: parsed.order.filter((id): id is string => typeof id === "string"),
      hidden: parsed.hidden.filter((id): id is string => typeof id === "string"),
    };
  } catch {
    return null;
  }
}

export function WidgetSlot({
  id,
  title,
  span = 12,
  lockHide = false,
  lockHideReason,
  children,
}: {
  id: string;
  title: string;
  /** Width in a 12-col grid on lg screens (full width below lg). */
  span?: 3 | 4 | 6 | 8 | 12;
  /** When true the slot cannot be hidden (e.g. the live softphone). */
  lockHide?: boolean;
  lockHideReason?: string;
  children: React.ReactNode;
}) {
  const { customizing, hideSlot } = useContext(LayoutContext);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !customizing,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`min-w-0 ${SPAN_CLASSES[span] ?? SPAN_CLASSES[12]} ${isDragging ? "opacity-60 z-30" : ""} ${
        customizing ? "rounded-[6px] outline-1 outline-dashed outline-[var(--ods-brand-500)] outline-offset-2" : ""
      }`}
    >
      <div className="relative h-full">
        {customizing && (
          <div className="absolute top-2 right-2 z-20 flex items-center gap-1 rounded-[4px] bg-[var(--ods-bg-primary)] border border-[var(--ods-border)] shadow-md p-0.5">
            <span
              {...attributes}
              {...listeners}
              role="button"
              aria-label={`Drag to move ${title}`}
              title={`Drag to move ${title}`}
              className="inline-flex cursor-grab active:cursor-grabbing text-[var(--ods-text-tertiary)] hover:text-[var(--ods-text-primary)] touch-none p-1"
            >
              <GripVertical className="w-4 h-4" />
            </span>
            {lockHide ? (
              <span
                title={lockHideReason ?? `${title} cannot be hidden`}
                className="inline-flex p-1 text-[var(--ods-text-tertiary)] opacity-40 cursor-not-allowed"
              >
                <EyeOff className="w-4 h-4" />
              </span>
            ) : (
              <button
                type="button"
                onClick={() => hideSlot(id)}
                title={`Hide ${title}`}
                aria-label={`Hide ${title}`}
                className="inline-flex p-1 text-[var(--ods-text-tertiary)] hover:text-[var(--ods-text-primary)]"
              >
                <EyeOff className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export function WidgetLayout({
  storageKey,
  children,
}: {
  /** localStorage key — one per page, e.g. "dialer:layout:lead-detail". */
  storageKey: string;
  children: React.ReactNode;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [customizing, setCustomizing] = useState(false);
  const [state, setState] = useState<LayoutState>(() => loadState(storageKey) ?? { order: [], hidden: [] });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // Private mode / quota: layout simply resets next visit.
    }
  }, [storageKey, state]);

  const slots = useMemo(() => {
    const out: SlotInfo[] = [];
    React.Children.forEach(children, (child) => {
      if (React.isValidElement(child)) {
        const props = child.props as { id?: unknown; title?: unknown };
        if (typeof props.id === "string") {
          out.push({ id: props.id, title: typeof props.title === "string" ? props.title : props.id });
        }
      }
    });
    return out;
  }, [children]);

  const presentIds = useMemo(() => slots.map((s) => s.id), [slots]);
  const titleOf = useMemo(() => new Map(slots.map((s) => [s.id, s.title])), [slots]);

  // Declared order first, then any new ids appended; drop stored ids that no
  // longer exist and never render hidden ones.
  const visibleIds = useMemo(() => {
    const present = new Set(presentIds);
    const ordered = state.order.filter((id) => present.has(id) && !state.hidden.includes(id));
    for (const id of presentIds) {
      if (!ordered.includes(id) && !state.hidden.includes(id)) ordered.push(id);
    }
    return ordered;
  }, [presentIds, state]);

  const hiddenPresent = useMemo(
    () => state.hidden.filter((id) => presentIds.includes(id)),
    [state.hidden, presentIds],
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setState((prev) => {
      // Reorder within the full stored order so hidden slots keep position.
      const full = [...prev.order];
      for (const id of visibleIds) {
        if (!full.includes(id)) full.push(id);
      }
      const from = full.indexOf(String(active.id));
      const to = full.indexOf(String(over.id));
      if (from === -1 || to === -1) return prev;
      return { ...prev, order: arrayMove(full, from, to) };
    });
  }

  function hideSlot(id: string) {
    setState((prev) => (prev.hidden.includes(id) ? prev : { ...prev, hidden: [...prev.hidden, id] }));
  }

  function showSlot(id: string) {
    setState((prev) => ({ ...prev, hidden: prev.hidden.filter((h) => h !== id) }));
  }

  function resetLayout() {
    setState({ order: [], hidden: [] });
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
  }

  const childById = useMemo(() => {
    const map = new Map<string, React.ReactNode>();
    React.Children.forEach(children, (child) => {
      if (React.isValidElement(child)) {
        const props = child.props as { id?: unknown };
        if (typeof props.id === "string" && !map.has(props.id)) map.set(props.id, child);
      }
    });
    return map;
  }, [children]);

  return (
    <LayoutContext.Provider value={{ customizing, hideSlot }}>
      <div className="flex flex-col gap-[var(--ods-sp-4)]">
      <div className="flex items-center justify-end gap-2 flex-wrap">
        {customizing && hiddenPresent.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap mr-auto">
            <span className="text-[11px] text-[var(--ods-text-tertiary)]">Hidden:</span>
            {hiddenPresent.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => showSlot(id)}
                title={`Show ${titleOf.get(id) ?? id}`}
                className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border border-dashed border-[var(--ods-border)] text-[var(--ods-text-secondary)] hover:text-[var(--ods-text-primary)] hover:border-[var(--ods-brand-500)]"
              >
                <Eye className="w-3 h-3" />
                {titleOf.get(id) ?? id}
              </button>
            ))}
          </div>
        )}
        {customizing && (
          <button
            type="button"
            onClick={resetLayout}
            title="Reset widgets to their default order and visibility"
            className="inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1.5 rounded-[6px] text-[var(--ods-text-secondary)] hover:text-[var(--ods-text-primary)] hover:bg-[var(--ods-bg-secondary)] border border-transparent hover:border-[var(--ods-border)]"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
        )}
        <button
          type="button"
          onClick={() => setCustomizing((v) => !v)}
          title={customizing ? "Finish arranging widgets" : "Rearrange and hide widgets"}
          aria-pressed={customizing}
          className={`inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1.5 rounded-[6px] border transition ${
            customizing
              ? "bg-[var(--ods-brand-600)] text-white border-transparent hover:bg-[var(--ods-brand-700)]"
              : "text-[var(--ods-text-secondary)] hover:text-[var(--ods-text-primary)] hover:bg-[var(--ods-bg-secondary)] border-transparent hover:border-[var(--ods-border)]"
          }`}
        >
          {customizing ? <Check className="w-3.5 h-3.5" /> : <SlidersHorizontal className="w-3.5 h-3.5" />}
          {customizing ? "Done" : "Customize"}
        </button>
      </div>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext items={visibleIds} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-[var(--ods-sp-6)]">
            {visibleIds.map((id) => (
              <React.Fragment key={id}>{childById.get(id)}</React.Fragment>
            ))}
          </div>
        </SortableContext>
      </DndContext>
      </div>
    </LayoutContext.Provider>
  );
}
