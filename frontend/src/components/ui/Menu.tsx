import { useMemo, useState, type ReactNode } from "react";
import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  size,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
  type Placement,
} from "@floating-ui/react";
import { Check, Search } from "lucide-react";

export interface MenuOption {
  value: string;
  label: string;
  /** Tailwind background class for a colour dot, e.g. "bg-emerald-500". */
  dot?: string;
  /** Right-aligned hint such as a count. */
  hint?: ReactNode;
}

export interface MenuSection {
  /** Group header, e.g. "Positive". Omit for an untitled group. */
  title?: string;
  options: MenuOption[];
}

/**
 * The one dropdown panel used across the app (filters, status pickers,
 * dispositions, column menus). Grouped sections with headers, a colour dot
 * per option, a check on the selected row, and a clear outline — modelled on
 * WAVV's disposition menu so it reads at a glance.
 */
export function SelectMenu({
  value,
  sections,
  onChange,
  trigger,
  triggerClassName,
  triggerTitle,
  searchable = false,
  placement = "bottom-start",
  width = 224,
  disabled = false,
  header,
}: {
  value: string | null | undefined;
  sections: MenuSection[];
  onChange: (value: string) => void;
  /** Contents of the trigger button. */
  trigger: ReactNode;
  triggerClassName: string;
  triggerTitle?: string;
  searchable?: boolean;
  placement?: Placement;
  width?: number;
  disabled?: boolean;
  /** Extra content above the sections, e.g. sort controls. */
  header?: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: (next) => {
      setOpen(next);
      if (!next) setQuery("");
    },
    placement,
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(6),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      size({
        padding: 8,
        apply({ availableHeight, elements }) {
          elements.floating.style.maxHeight = `${Math.max(160, Math.min(availableHeight, 420))}px`;
        },
      }),
    ],
  });
  const { getReferenceProps, getFloatingProps } = useInteractions([
    useClick(context, { enabled: !disabled }),
    useDismiss(context),
    useRole(context, { role: "listbox" }),
  ]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sections;
    return sections
      .map((s) => ({ ...s, options: s.options.filter((o) => o.label.toLowerCase().includes(q)) }))
      .filter((s) => s.options.length > 0);
  }, [sections, query]);

  const close = () => {
    setOpen(false);
    setQuery("");
  };
  const choose = (v: string) => {
    close();
    onChange(v);
  };

  return (
    <>
      <button
        type="button"
        ref={refs.setReference}
        {...getReferenceProps({ onClick: (e) => e.stopPropagation() })}
        disabled={disabled}
        title={triggerTitle}
        aria-expanded={open}
        className={triggerClassName}
      >
        {trigger}
      </button>

      {open && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={{ ...floatingStyles, width }}
            {...getFloatingProps({ onClick: (e) => e.stopPropagation() })}
            className="z-[70] flex flex-col overflow-hidden rounded-[8px] border border-[var(--ods-border-strong)] bg-[var(--ods-bg-primary)] shadow-[0_12px_32px_rgba(0,0,0,0.18)] select-none"
          >
            {searchable && (
              <div className="p-2 border-b border-[var(--ods-border)]">
                <div className="flex items-center gap-2 h-8 px-2 rounded-[6px] bg-[var(--ods-bg-secondary)] border border-[var(--ods-border)] focus-within:border-[var(--ods-brand-500)]">
                  <Search className="w-3.5 h-3.5 text-[var(--ods-text-tertiary)] shrink-0" />
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search"
                    className="flex-1 bg-transparent text-[13px] text-[var(--ods-text-primary)] outline-none placeholder:text-[var(--ods-text-tertiary)]"
                  />
                </div>
              </div>
            )}
            <div className="overflow-y-auto py-1">
              {header?.(close)}
              {shown.length === 0 && query ? (
                <div className="px-3 py-4 text-center text-[12px] text-[var(--ods-text-tertiary)]">No matches</div>
              ) : (
                shown.map((section, i) => (
                  <div key={section.title ?? i} role="group" aria-label={section.title}>
                    {section.title && (
                      <div className="mt-1 first:mt-0 px-3 py-1.5 bg-[var(--ods-bg-secondary)] text-[11px] font-semibold uppercase tracking-wider text-[var(--ods-text-tertiary)]">
                        {section.title}
                      </div>
                    )}
                    {section.options.map((option) => (
                      <MenuRow
                        key={option.value}
                        option={option}
                        selected={option.value === value}
                        onSelect={() => choose(option.value)}
                      />
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        </FloatingPortal>
      )}
    </>
  );
}

/** One selectable row: dot, label, optional hint, check when selected. */
export function MenuRow({
  option,
  selected,
  onSelect,
}: {
  option: MenuOption;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={`mx-1 h-9 px-2.5 flex items-center gap-2.5 rounded-[6px] text-[13px] cursor-pointer transition-colors ${
        selected
          ? "bg-[var(--ods-active)] font-medium text-[var(--ods-text-primary)]"
          : "text-[var(--ods-text-primary)] hover:bg-[var(--ods-hover)]"
      }`}
    >
      {option.dot && <span className={`w-2 h-2 rounded-full shrink-0 ${option.dot}`} />}
      <span className="flex-1 truncate">{option.label}</span>
      {option.hint !== undefined && (
        <span className="text-[12px] tabular-nums text-[var(--ods-text-tertiary)]">{option.hint}</span>
      )}
      {selected && <Check className="w-4 h-4 shrink-0 text-[var(--ods-brand-600)]" />}
    </div>
  );
}

/**
 * Toolbar filter trigger: "Label: value". Outlined in brand colour while a
 * filter is applied, so it is obvious which filters are shaping the list.
 */
export function filterTriggerClass(active: boolean): string {
  return `h-7 px-2.5 shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 rounded-[6px] border text-[12px] transition-colors ${
    active
      ? "border-[var(--ods-brand-500)] bg-[var(--ods-brand-50)] text-[var(--ods-brand-700)] dark:bg-[var(--ods-brand-900)]/40 dark:text-[var(--ods-brand-300)]"
      : "border-[var(--ods-border-strong)] bg-[var(--ods-bg-primary)] text-[var(--ods-text-primary)] hover:bg-[var(--ods-hover)]"
  }`;
}

export function FilterTriggerContent({ label, value, dot }: { label: string; value: string; dot?: string }) {
  return (
    <>
      <span className="text-[var(--ods-text-secondary)]">{label}:</span>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />}
      <span className="font-medium">{value}</span>
      <ChevronDownIcon />
    </>
  );
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 opacity-60" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
      <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
