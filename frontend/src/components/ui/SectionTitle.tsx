import type { ReactNode } from "react";
import { InfoTip, type TipSpec } from "./InfoTip";

/** Rounded qualifier shown beside a title (unit, count, scope) instead of brackets. */
export function TitlePill({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center h-6 px-2 rounded-md border border-[var(--ods-border)] bg-[var(--ods-bg-secondary)] text-[12px] font-semibold text-[var(--ods-text-secondary)] tabular-nums whitespace-nowrap ${className}`}
    >
      {children}
    </span>
  );
}

/**
 * Standard heading for cards, sections and pages: a text-xl title, its
 * qualifier in a pill, and the explanation behind an eye-icon tooltip.
 */
export function SectionTitle({
  title,
  pill,
  info,
  as: Tag = "h3",
  className = "",
}: {
  title: ReactNode;
  pill?: ReactNode;
  info?: TipSpec;
  as?: "h1" | "h2" | "h3";
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2 min-w-0 ${className}`}>
      <Tag className="text-xl font-semibold text-[var(--ods-text-primary)] truncate">{title}</Tag>
      {pill !== undefined && pill !== null && pill !== "" && <TitlePill>{pill}</TitlePill>}
      {info && <InfoTip tip={info} />}
    </div>
  );
}
