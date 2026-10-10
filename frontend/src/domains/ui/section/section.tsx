import type { ReactNode } from "react";
import { ChevronDown, ChevronRight, type IconComponent } from "@/domains/ui/icons";
import { InfoTip, type TipSpec } from "@/domains/ui/infoTip";
import { RADIUS, TEXT } from "@/domains/ui/tokens";

/**
 * A titled card. The header and every divider run the full width of the
 * card (rows carry their own padding, the body never does), so lines meet
 * the border instead of stopping short.
 *
 *   <Section title="People" count={2} action={<Button …/>}>
 *     <SectionRow>…</SectionRow>
 *     <SectionRow>…</SectionRow>
 *   </Section>
 *
 * `padded` gives free-form content (forms, text) the standard 12px inset.
 */
export function Section({
  title,
  icon: Icon,
  count,
  tip,
  action,
  collapsed,
  onToggle,
  padded = false,
  children,
}: {
  title: string;
  icon?: IconComponent;
  /** Shown in a pill after the title; null while the number is still loading (skeleton, never a premature 0). */
  count?: number | null;
  tip?: TipSpec;
  action?: ReactNode;
  /** With onToggle, the header collapses the body. */
  collapsed?: boolean;
  onToggle?: () => void;
  padded?: boolean;
  children?: ReactNode;
}) {
  const heading = (
    <span className="flex items-center gap-2 min-w-0">
      {Icon && <Icon className="w-3.5 h-3.5 shrink-0 text-[var(--ods-text-tertiary)]" aria-hidden="true" />}
      <span className={`${TEXT.input} font-semibold truncate`}>{title}</span>
      {count === null ? (
        <span className={`h-5 w-6 ${RADIUS.chip} bg-[var(--ods-bg-tertiary)] animate-pulse`} role="status" aria-label="Loading count" />
      ) : count !== undefined ? (
        <span className={`h-5 min-w-5 px-1.5 ${RADIUS.chip} bg-[var(--ods-bg-tertiary)] ${TEXT.meta} font-semibold tabular-nums inline-flex items-center justify-center`}>
          {count}
        </span>
      ) : null}
      {onToggle &&
        (collapsed ? (
          <ChevronRight className="w-3 h-3 text-[var(--ods-text-tertiary)]" aria-hidden="true" />
        ) : (
          <ChevronDown className="w-3 h-3 text-[var(--ods-text-tertiary)]" aria-hidden="true" />
        ))}
    </span>
  );
  return (
    <section className={`${RADIUS.card} border border-[var(--ods-border)] bg-[var(--ods-bg-primary)] overflow-hidden`}>
      <header className="h-11 px-3 flex items-center justify-between gap-2">
        {onToggle ? (
          <button type="button" onClick={onToggle} aria-expanded={!collapsed} className="min-w-0 flex-1 text-left">
            {heading}
          </button>
        ) : (
          heading
        )}
        <span className="flex items-center gap-1 shrink-0">
          {tip && <InfoTip tip={tip} />}
          {action}
        </span>
      </header>
      {!collapsed && children !== undefined && children !== null && children !== false && (
        <div className={`border-t border-[var(--ods-border)] ${padded ? "p-3" : "divide-y divide-[var(--ods-border)]"}`}>{children}</div>
      )}
    </section>
  );
}

/** One row inside a Section: full-width divider above it, 12px side padding. */
export function SectionRow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`px-3 py-2.5 ${className}`}>{children}</div>;
}
