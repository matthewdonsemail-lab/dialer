import { useMemo, useState, type ReactNode } from "react";
import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  size,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
  type Placement,
} from "@floating-ui/react";
import { Check, ChevronDown, Search } from "@/components/ui/icons";

export interface MenuOption {
  value: string;
  label: string;
  /** Tailwind background class for a colour dot, e.g. "bg-emerald-500". */
  dot?: string;
  /** Leading visual such as a country flag; shown instead of the dot. */
  icon?: ReactNode;
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
 * WAVV's disposition menu, styled like the YouSpot chat menus (.ods-menu).
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
  width = 248,
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
  // The trigger is a plain button; Floating UI only mounts while the menu is
  // open. Tables render one of these per row, so closed menus must cost
  // nothing (no positioning hooks), or reordering columns re-renders slowly.
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);

  return (
    <>
      <button
        type="button"
        ref={setAnchor}
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) setOpen((o) => !o);
        }}
        disabled={disabled}
        title={triggerTitle}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`ods-menu-trigger ${triggerClassName}`}
      >
        {trigger}
      </button>

      {open && anchor && (
        <SelectMenuPanel
          anchor={anchor}
          onClose={() => setOpen(false)}
          value={value}
          sections={sections}
          onChange={onChange}
          searchable={searchable}
          placement={placement}
          width={width}
          header={header}
        />
      )}
    </>
  );
}

function SelectMenuPanel({
  anchor,
  onClose,
  value,
  sections,
  onChange,
  searchable,
  placement,
  width,
  header,
}: {
  anchor: HTMLElement;
  onClose: () => void;
  value: string | null | undefined;
  sections: MenuSection[];
  onChange: (value: string) => void;
  searchable: boolean;
  placement: Placement;
  width: number;
  header?: (close: () => void) => ReactNode;
}) {
  const [query, setQuery] = useState("");

  const { refs, floatingStyles, context, isPositioned } = useFloating({
    open: true,
    onOpenChange: (next) => {
      if (!next) onClose();
    },
    elements: { reference: anchor },
    placement,
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(8),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      size({
        padding: 8,
        apply({ availableHeight, elements }) {
          elements.floating.style.maxHeight = `${Math.max(160, Math.min(availableHeight, 460))}px`;
        },
      }),
    ],
  });
  const { getFloatingProps } = useInteractions([useDismiss(context), useRole(context, { role: "listbox" })]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sections;
    return sections
      .map((s) => ({ ...s, options: s.options.filter((o) => o.label.toLowerCase().includes(q)) }))
      .filter((s) => s.options.length > 0);
  }, [sections, query]);

  const choose = (v: string) => {
    onClose();
    onChange(v);
  };

  return (
    <FloatingPortal>
      <div
        ref={refs.setFloating}
        style={{ ...floatingStyles, width, visibility: isPositioned ? undefined : "hidden" }}
        data-ready={isPositioned || undefined}
        {...getFloatingProps({ onClick: (e) => e.stopPropagation() })}
        className="ods-menu"
      >
        {searchable && (
          <div className="ods-menu-search">
            <Search className="ods-menu-icon" />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" />
          </div>
        )}
        <div className="overflow-y-auto min-h-0 space-y-0.5">
          {header?.(onClose)}
          {shown.length === 0 && query ? (
            <div className="ods-menu-empty">No matches</div>
          ) : (
            shown.map((section, i) => (
              <div key={section.title ?? i} role="group" aria-label={section.title}>
                {section.title && <div className="ods-menu-group-label">{section.title}</div>}
                {section.options.map((option) => (
                  <MenuRow key={option.value} option={option} selected={option.value === value} onSelect={() => choose(option.value)} />
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </FloatingPortal>
  );
}

/**
 * A floating .ods-menu card pinned to an existing element. Mount it only while
 * open; it positions below the anchor on the first frame and closes on an
 * outside click or Escape.
 */
export function AnchoredMenu({
  anchor,
  onClose,
  placement = "bottom-start",
  className = "",
  children,
}: {
  anchor: HTMLElement;
  onClose: () => void;
  placement?: Placement;
  className?: string;
  children: ReactNode;
}) {
  const { refs, floatingStyles, context, isPositioned } = useFloating({
    open: true,
    onOpenChange: (next) => {
      if (!next) onClose();
    },
    elements: { reference: anchor },
    placement,
    whileElementsMounted: autoUpdate,
    middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 })],
  });
  const { getFloatingProps } = useInteractions([useDismiss(context), useRole(context, { role: "menu" })]);
  return (
    <FloatingPortal>
      <div
        ref={refs.setFloating}
        style={{ ...floatingStyles, visibility: isPositioned ? undefined : "hidden" }}
        data-ready={isPositioned || undefined}
        {...getFloatingProps({ onClick: (e) => e.stopPropagation() })}
        className={`ods-menu ${className}`}
      >
        {children}
      </div>
    </FloatingPortal>
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
      tabIndex={-1}
      className="ods-menu-item"
    >
      {option.icon ?? (option.dot && <span className={`ods-menu-dot ${option.dot}`} />)}
      <span className="flex-1 truncate">{option.label}</span>
      {option.hint !== undefined && <span className="ods-menu-hint">{option.hint}</span>}
      {selected && <Check className="ods-menu-icon" />}
    </div>
  );
}

/**
 * Toolbar filter trigger: "Label: value". Outlined in brand colour while a
 * filter is applied, so it is obvious which filters are shaping the list.
 */
export function filterTriggerClass(active: boolean): string {
  return `h-8 px-3 shrink-0 whitespace-nowrap inline-flex items-center gap-2 rounded-[7px] border text-[13px] font-medium transition-colors ${
    active
      ? "border-[var(--ods-brand-500)] bg-[var(--ods-brand-50)] text-[var(--ods-brand-700)] dark:bg-[var(--ods-brand-900)]/40 dark:text-[var(--ods-brand-300)]"
      : "border-[var(--ods-border-strong)] bg-[var(--ods-bg-primary)] text-[var(--ods-text-primary)] hover:bg-[var(--ods-hover)]"
  }`;
}

export function FilterTriggerContent({ label, value, dot, icon }: { label: string; value: string; dot?: string; icon?: ReactNode }) {
  return (
    <>
      <span className="text-[var(--ods-text-secondary)]">{label}:</span>
      {icon ?? (dot && <span className={`w-2.5 h-2.5 rounded-md ${dot}`} />)}
      <span className="font-semibold">{value}</span>
      <ChevronDown className="w-3 h-3 opacity-60" />
    </>
  );
}
