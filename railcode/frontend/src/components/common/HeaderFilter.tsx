import React, { useState } from "react";
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  FloatingPortal,
  useClick,
  useDismiss,
  useRole,
  useInteractions,
} from "@floating-ui/react";
import { Filter } from "lucide-react";

export interface HeaderFilterOption {
  value: string;
  label: string;
  count?: number;
}

interface HeaderFilterProps {
  /** Column label shown in the popover title */
  label: string;
  /** Current value; "all" means no filter */
  value: string;
  options: HeaderFilterOption[];
  onChange: (newValue: string) => void;
}

/**
 * Column-header filter button + floating-ui popover.
 * Same @floating-ui/react pattern as StatusSelect/CampaignSelect, with
 * click-outside dismiss. Shows "All" plus one row per option with counts.
 */
export function HeaderFilter({ label, value, options, onChange }: HeaderFilterProps) {
  const [isOpen, setIsOpen] = useState(false);

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement: "bottom-start",
    whileElementsMounted: autoUpdate,
    middleware: [offset(4), flip(), shift({ padding: 8 })],
  });

  const click = useClick(context);
  const dismiss = useDismiss(context);
  const role = useRole(context);
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss, role]);

  const active = value !== "all";
  const total = options.reduce((sum, o) => sum + (o.count ?? 0), 0);

  return (
    <>
      <button
        ref={refs.setReference}
        {...getReferenceProps()}
        title={`Filter ${label}`}
        className={`ml-1 p-0.5 rounded-[3px] transition-colors ${
          active
            ? "text-[var(--ods-brand-600)]"
            : "text-[var(--ods-text-tertiary)] opacity-0 group-hover/th:opacity-100 hover:text-[var(--ods-text-primary)]"
        } ${isOpen ? "!opacity-100" : ""}`}
      >
        <Filter className="w-3 h-3" fill={active ? "currentColor" : "none"} />
      </button>

      {isOpen && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className="z-[60] w-52 py-1 bg-[var(--ods-bg-primary)] border border-[var(--ods-border)] rounded-[6px] shadow-lg flex flex-col gap-0.5 select-none"
          >
            <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--ods-text-tertiary)]">
              {label}
            </div>
            <FilterRow
              label="All"
              count={total}
              selected={!active}
              onClick={() => {
                onChange("all");
                setIsOpen(false);
              }}
            />
            {options.map((option) => (
              <FilterRow
                key={option.value}
                label={option.label}
                count={option.count}
                selected={option.value === value}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
              />
            ))}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}

function FilterRow({
  label,
  count,
  selected,
  onClick,
}: {
  label: string;
  count?: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`min-h-7 px-2.5 mx-1 py-1 rounded-[4px] flex items-center justify-between gap-2 text-[12px] cursor-pointer transition-colors ${
        selected
          ? "bg-[var(--ods-bg-secondary)] font-medium text-[var(--ods-text-primary)]"
          : "text-[var(--ods-text-secondary)] hover:bg-[var(--ods-bg-secondary)] hover:text-[var(--ods-text-primary)]"
      }`}
    >
      <span className="truncate">{label}</span>
      {count !== undefined && (
        <span className="text-[11px] text-[var(--ods-text-tertiary)] tabular-nums">{count}</span>
      )}
    </div>
  );
}
