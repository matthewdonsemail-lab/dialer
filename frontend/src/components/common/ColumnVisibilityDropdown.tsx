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
import { Check, Columns3 } from "lucide-react";
import { FilterTriggerContent, filterTriggerClass } from "@/components/ui/Menu";

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
  const { refs, floatingStyles, context } = useFloating({
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
            style={floatingStyles}
            {...getFloatingProps()}
            className="z-[70] w-56 py-1 rounded-[8px] border border-[var(--ods-border-strong)] bg-[var(--ods-bg-primary)] shadow-[0_12px_32px_rgba(0,0,0,0.18)] select-none"
          >
            <div className="px-3 py-1.5 bg-[var(--ods-bg-secondary)] text-[11px] font-semibold uppercase tracking-wider text-[var(--ods-text-tertiary)]">
              Visible columns
            </div>
            {columns.map((col) => (
              <button
                key={col.key}
                role="menuitemcheckbox"
                aria-checked={col.visible}
                onClick={() => onChange(col.key, !col.visible)}
                className="mx-1 w-[calc(100%-8px)] h-9 px-2.5 flex items-center gap-2.5 rounded-[6px] text-[13px] text-[var(--ods-text-primary)] hover:bg-[var(--ods-hover)]"
              >
                <span
                  className={`w-4 h-4 rounded-[4px] border flex items-center justify-center shrink-0 ${
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
            {someHidden && (
              <button
                onClick={() => columns.forEach((c) => !c.visible && onChange(c.key, true))}
                className="mt-1 w-full h-8 border-t border-[var(--ods-border)] text-[12px] font-medium text-[var(--ods-brand-600)] hover:bg-[var(--ods-hover)]"
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
