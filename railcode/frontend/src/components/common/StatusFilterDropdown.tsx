import { useState, useMemo } from "react";
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  FloatingPortal,
  useClick,
  useDismiss,
  useInteractions,
} from "@floating-ui/react";
import { Search, Check, ChevronDown } from "lucide-react";
import type { StatusOption } from "./StatusSelect";

interface StatusFilterDropdownProps {
  value: string;
  options: StatusOption[];
  onChange: (value: string) => void;
  allLabel?: string;
}

/**
 * Twenty-style status filter: button + floating panel with search and
 * selectable option rows (dot + label + check). Closes on select, outside
 * click, or Escape.
 */
export function StatusFilterDropdown({
  value,
  options,
  onChange,
  allLabel = "All statuses",
}: StatusFilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement: "bottom-start",
    whileElementsMounted: autoUpdate,
    middleware: [offset(4), flip(), shift({ padding: 8 })],
  });
  const click = useClick(context);
  const dismiss = useDismiss(context);
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss]);

  const current = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const choose = (v: string) => {
    onChange(v);
    setIsOpen(false);
    setQuery("");
  };

  const rowClass = (selected: boolean) =>
    `w-full h-9 px-2.5 flex items-center gap-2 text-[12px] cursor-pointer rounded-[4px] transition-colors ${
      selected
        ? "bg-[var(--ods-bg-secondary)] font-medium text-[var(--ods-text-primary)]"
        : "text-[var(--ods-text-secondary)] hover:bg-[var(--ods-bg-secondary)] hover:text-[var(--ods-text-primary)]"
    }`;

  return (
    <div className="relative">
      <button
        ref={refs.setReference}
        {...getReferenceProps()}
        className="h-7 px-2.5 inline-flex items-center gap-1.5 rounded-[6px] text-[12px] font-medium border border-[var(--ods-border)] bg-[var(--ods-bg-primary)] text-[var(--ods-text-primary)] hover:bg-[var(--ods-bg-secondary)] transition-colors select-none"
      >
        {current ? (
          <>
            <span className={`w-1.5 h-1.5 rounded-full ${current.dotColor}`} />
            <span>{current.label}</span>
          </>
        ) : (
          <span>{allLabel}</span>
        )}
        <ChevronDown className="w-3.5 h-3.5 opacity-60" />
      </button>

      {isOpen && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className="z-[60] w-56 bg-white border border-[var(--ods-border)] rounded-[6px] shadow-lg overflow-hidden flex flex-col"
          >
            <div className="p-2 border-b border-[var(--ods-border)]">
              <div className="flex items-center gap-2 h-8 px-2 rounded-[4px] bg-[var(--ods-bg-secondary)] border border-[var(--ods-border)]">
                <Search className="w-3.5 h-3.5 text-[var(--ods-text-tertiary)] shrink-0" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search"
                  className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-[var(--ods-text-tertiary)]"
                />
              </div>
            </div>
            <div className="max-h-[240px] overflow-y-auto py-1" role="listbox">
              <button key="__all" onClick={() => choose("all")} className={rowClass(value === "all")}>
                <span className="flex-1 text-left">{allLabel}</span>
                {value === "all" && <Check className="w-3.5 h-3.5 text-[var(--ods-brand-600)] shrink-0" />}
              </button>
              {filtered.length === 0 ? (
                <div className="px-3 py-4 text-center text-[12px] text-[var(--ods-text-tertiary)]">No matches</div>
              ) : (
                filtered.map((opt) => (
                  <button key={opt.value} onClick={() => choose(opt.value)} className={rowClass(opt.value === value)}>
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${opt.dotColor}`} />
                    <span className="flex-1 text-left truncate">{opt.label}</span>
                    {opt.value === value && <Check className="w-3.5 h-3.5 text-[var(--ods-brand-600)] shrink-0" />}
                  </button>
                ))
              )}
            </div>
          </div>
        </FloatingPortal>
      )}
    </div>
  );
}
