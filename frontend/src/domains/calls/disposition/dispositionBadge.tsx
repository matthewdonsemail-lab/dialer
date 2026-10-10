import { Chip } from "@/domains/ui/chip";
import {
  AlertCircle,
  AlertTriangle,
  Ban,
  CalendarDays,
  CheckCircle,
  Clock,
  HelpCircle,
  PhoneCall,
  PhoneIncoming,
  PhoneOff,
  ThumbsDown,
  ThumbsUp,
  Voicemail,
  XCircle,
  type IconComponent,
} from "@/domains/ui/icons";
import { callStatusLabel, dispositionTypeOfStatus, type DispositionType } from "./callOutcome";

/** One icon per persisted call status, so a disposition reads at a glance. */
const ICONS: Record<string, IconComponent> = {
  INTERESTED: ThumbsUp,
  APPOINTMENT_SET: CalendarDays,
  CALLBACK: PhoneIncoming,
  GOOD_NUMBER: CheckCircle,
  LEFT_CALLBACK: PhoneCall,
  VOICEMAIL: Voicemail,
  NOT_INTERESTED: ThumbsDown,
  BAD_NUMBER: AlertTriangle,
  NO_ANSWER: PhoneOff,
  WRONG_NUMBER: XCircle,
  DNC: Ban,
  COMPLETED: CheckCircle,
  BUSY: PhoneOff,
  FAILED: AlertCircle,
  IN_PROGRESS: Clock,
};

const TYPE_COLOR: Record<DispositionType | "neutral", string> = {
  positive: "text-emerald-600",
  negative: "text-red-600",
  neutral: "text-[var(--ods-text-tertiary)]",
};

export interface DispositionMeta {
  label: string;
  icon: IconComponent;
  type: DispositionType | "neutral";
  /** Tailwind text colour for the icon. */
  color: string;
}

export function dispositionMeta(status: string | null | undefined): DispositionMeta {
  const upper = String(status ?? "").toUpperCase();
  const type = dispositionTypeOfStatus(upper) ?? "neutral";
  return {
    label: upper ? callStatusLabel(upper) : "Unknown",
    icon: ICONS[upper] ?? HelpCircle,
    type,
    color: TYPE_COLOR[type],
  };
}

/** The disposition's icon in its type colour (green positive, red negative, gray neutral). */
export function DispositionIcon({ status, className = "w-3.5 h-3.5" }: { status: string | null | undefined; className?: string }) {
  const meta = dispositionMeta(status);
  const Icon = meta.icon;
  return <Icon className={`shrink-0 ${meta.color} ${className}`} aria-hidden="true" />;
}

/**
 * Neutral gray chip with the disposition's icon on the left. The icon and its
 * colour carry the meaning, so the chip itself never competes for attention.
 */
export function DispositionBadge({ status }: { status: string | null | undefined }) {
  const meta = dispositionMeta(status);
  return (
    <Chip icon={meta.icon} iconClassName={meta.color} title={`${meta.label} (${meta.type})`}>
      {meta.label}
    </Chip>
  );
}
