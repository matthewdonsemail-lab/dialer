import React, { useState } from "react";
import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
} from "@floating-ui/react";
import { Check, Columns3 } from "@/domains/ui/icons";
import { FilterTriggerContent, filterTriggerClass } from "@/domains/ui/menu";

export interface ColumnDef {
  key: string;
  label: string;
  visible: boolean;
}

interface ColumnVisibilityDropdownProps {
  columns: ColumnDef[];
  onChange: (key: string, visible: boolean) => void;
}

/**
 * "Columns: 7/9" toolbar control. Stays open while toggling so several
 * columns can be shown or hidden in one go; outlined while any are hidden.
 */
export const ColumnVisibilityDropdown: React.FC<ColumnVisibilityDropdownProps> = ({ columns, onChange }) => {
  const [open, setOpen] = useState(false);
  const { refs, floatingStyles, context, isPositioned } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: "bottom-end",
    whileElementsMounted: autoUpdate,
    middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
  });
  const { getReferenceProps, getFloatingProps } = useInteractions([useClick(context), useDismiss(context)]);

  const shown = columns.filter((c) => c.visible).length;
  const someHidden = shown < columns.length;

  return (
    <>
      <button
        type="button"
        ref={refs.setReference}
        {...getReferenceProps()}
        title="Show or hide columns"
        className={filterTriggerClass(someHidden)}
      >
        <Columns3 className="w-3.5 h-3.5" />
        <FilterTriggerContent label="Columns" value={`${shown}/${columns.length}`} />
      </button>

      {open && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={{ ...floatingStyles, visibility: isPositioned ? undefined : "hidden" }}
            data-ready={isPositioned || undefined}
            {...getFloatingProps()}
            className="ods-menu w-60"
          >
            <div className="ods-menu-group-label">
              Visible columns
            </div>
            {columns.map((col) => (
              <button
                key={col.key}
                role="menuitemcheckbox"
                aria-checked={col.visible}
                onClick={() => onChange(col.key, !col.visible)}
                className="ods-menu-item"
              >
                <span
                  className={`w-[18px] h-[18px] rounded-md border-2 flex items-center justify-center shrink-0 ${
                    col.visible
                      ? "bg-[var(--ods-brand-600)] border-[var(--ods-brand-600)] text-white"
                      : "border-[var(--ods-border-strong)]"
                  }`}
                >
                  {col.visible && <Check className="w-3 h-3 stroke-[3]" />}
                </span>
                <span className="flex-1 text-left truncate">{col.label}</span>
              </button>
            ))}
            {someHidden && <div className="ods-menu-separator" />}
            {someHidden && (
              <button
                onClick={() => columns.forEach((c) => !c.visible && onChange(c.key, true))}
                className="ods-menu-item justify-center mt-1 !text-[var(--ods-brand-600)] font-semibold"
              >
                Show all columns
              </button>
            )}
          </div>
        </FloatingPortal>
      )}
    </>
  );
};
