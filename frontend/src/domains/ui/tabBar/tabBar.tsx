import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { IconComponent } from "@/domains/ui/icons";

export interface TabDef<K extends string> {
  key: K;
  label: string;
  icon: IconComponent;
  /** Small count after the label, e.g. number of calls. */
  badge?: ReactNode;
}

/**
 * The one tab bar for page sections (Reports, Admin, call review, scripts,
 * settings). It sizes itself from the space it actually gets, not the
 * viewport, so it works in a page, a modal or a side panel:
 *   roomy   icon + label side by side
 *   tight   icon above a smaller label
 *   narrow  icon only, under 64px per tab (label as tooltip and for screen readers)
 * Tabs never wrap onto two lines; if even icons do not fit it scrolls sideways.
 */
export function TabBar<K extends string>({
  tabs,
  value,
  onChange,
  className = "",
}: {
  tabs: TabDef<K>[];
  value: K;
  onChange: (key: K) => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [perTab, setPerTab] = useState(200);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setPerTab(el.clientWidth / Math.max(1, tabs.length));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tabs.length]);

  const mode = perTab >= 150 ? "roomy" : perTab >= 64 ? "tight" : "narrow";

  return (
    <div
      ref={ref}
      role="tablist"
      className={`flex gap-1 p-1 rounded-[10px] border border-[var(--ods-border)] bg-[var(--ods-bg-primary)] overflow-x-auto no-scrollbar ${className}`}
    >
      {tabs.map(({ key, label, icon: Icon, badge }) => {
        const active = value === key;
        return (
          <button
            key={key}
            role="tab"
            aria-selected={active}
            aria-label={mode === "narrow" ? label : undefined}
            title={mode === "roomy" ? undefined : label}
            onClick={() => onChange(key)}
            className={`flex-1 min-w-[44px] shrink-0 rounded-[8px] inline-flex items-center justify-center transition-colors whitespace-nowrap ${
              mode === "tight" ? "flex-col gap-0.5 h-12 px-1 text-[12px]" : "gap-2 h-10 px-2 text-[14px]"
            } font-semibold ${
              active
                ? "bg-[var(--ods-brand-600)] text-white"
                : "text-[var(--ods-text-secondary)] hover:bg-[var(--ods-hover)] hover:text-[var(--ods-text-primary)]"
            }`}
          >
            <span className="relative inline-flex">
              <Icon className="w-4 h-4" />
              {badge !== undefined && badge !== null && mode !== "roomy" && (
                <span
                  className={`absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-md text-[12px] leading-4 text-center ${
                    active ? "bg-white text-[var(--ods-brand-600)]" : "bg-[var(--ods-brand-600)] text-white"
                  }`}
                >
                  {badge}
                </span>
              )}
            </span>
            {mode !== "narrow" && <span className="max-w-full truncate">{label}</span>}
            {badge !== undefined && badge !== null && mode === "roomy" && (
              <span className={`px-1.5 rounded-md text-[12px] ${active ? "bg-white/20" : "bg-[var(--ods-bg-tertiary)]"}`}>{badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
