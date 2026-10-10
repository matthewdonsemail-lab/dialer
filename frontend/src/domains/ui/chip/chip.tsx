import type { ReactNode } from "react";
import {
  Ban,
  CheckCircle,
  PhoneCall,
  PhoneIncoming,
  Plus,
  ThumbsDown,
  ThumbsUp,
  XCircle,
  type IconComponent,
} from "@/domains/ui/icons";

/**
 * The one badge style in the app: a neutral gray chip whose meaning comes
 * from a coloured icon (or dot) on the left. Dispositions, statuses, health,
 * verdicts, actions and value badges all render through this so they read
 * the same everywhere.
 */
export function Chip({
  children,
  icon: Icon,
  iconClassName = "text-[var(--ods-text-tertiary)]",
  dot,
  trailing,
  title,
  className = "",
}: {
  children: ReactNode;
  icon?: IconComponent;
  /** Tailwind text colour for the icon. */
  iconClassName?: string;
  /** CSS colour (or Tailwind bg class) for a dot, used when there is no icon. */
  dot?: string;
  trailing?: ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 max-w-full h-6 px-2 rounded-md border border-[var(--ods-border)] bg-[var(--ods-bg-tertiary)] text-[12px] font-semibold text-[var(--ods-text-primary)] whitespace-nowrap ${className}`}
    >
      {Icon ? (
        <Icon className={`w-3.5 h-3.5 shrink-0 ${iconClassName}`} aria-hidden="true" />
      ) : dot ? (
        dot.startsWith("bg-") ? (
          <span className={`w-2 h-2 shrink-0 rounded-md ${dot}`} />
        ) : (
          <span className="w-2 h-2 shrink-0 rounded-md" style={{ background: dot }} />
        )
      ) : null}
      <span className="truncate">{children}</span>
      {trailing}
    </span>
  );
}

/** Icons for contact / lead statuses (Twenty's values, any case or separator). */
const STATUS_ICONS: Record<string, IconComponent> = {
  new: Plus,
  contacted: PhoneCall,
  interested: ThumbsUp,
  callback: PhoneIncoming,
  call_back: PhoneIncoming,
  not_interested: ThumbsDown,
  converted: CheckCircle,
  won: CheckCircle,
  closed_won: CheckCircle,
  qualified: CheckCircle,
  disqualified: XCircle,
  lost: XCircle,
  closed_lost: XCircle,
  do_not_contact: Ban,
  dnc: Ban,
};

export function statusIcon(value: string | null | undefined): IconComponent | undefined {
  const key = String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return STATUS_ICONS[key];
}

/** "bg-emerald-500" -> "text-emerald-600": option dot colours become icon colours. */
export function iconColorFromDot(dot: string | undefined): string {
  if (!dot || !dot.startsWith("bg-")) return "text-[var(--ods-text-tertiary)]";
  return dot.replace(/^bg-/, "text-").replace(/-(400|500)$/, "-600");
}
