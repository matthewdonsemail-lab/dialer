import { toContactStatus, toLegacyStatus } from "@dialer/shared";
import type { StatusOption } from "@/domains/ui/status";

const COLOR_MAP: Record<string, { dotColor: string; bgTint: string; textColor: string; iconColor: string }> = {
  green:   { dotColor: "bg-green-500",       bgTint: "bg-green-500/10",          textColor: "text-green-700", iconColor: "text-green-600" },
  red:     { dotColor: "bg-red-500",         bgTint: "bg-red-500/10",            textColor: "text-red-700", iconColor: "text-red-600" },
  gray:    { dotColor: "bg-gray-500",        bgTint: "bg-gray-500/10",           textColor: "text-[var(--ods-text-primary)]", iconColor: "text-[var(--ods-text-tertiary)]" },
  amber:   { dotColor: "bg-amber-500",       bgTint: "bg-amber-500/10",          textColor: "text-amber-700", iconColor: "text-amber-600" },
  blue:    { dotColor: "bg-blue-500",        bgTint: "bg-blue-500/10",           textColor: "text-blue-700", iconColor: "text-blue-600" },
  emerald: { dotColor: "bg-emerald-500",     bgTint: "bg-emerald-500/10",        textColor: "text-emerald-700", iconColor: "text-emerald-600" },
  purple:  { dotColor: "bg-purple-500",      bgTint: "bg-purple-500/10",         textColor: "text-purple-700", iconColor: "text-purple-600" },
  cyan:    { dotColor: "bg-cyan-500",        bgTint: "bg-cyan-500/10",           textColor: "text-cyan-700", iconColor: "text-cyan-600" },
  slate:   { dotColor: "bg-slate-500",       bgTint: "bg-slate-500/10",          textColor: "text-slate-700", iconColor: "text-slate-600" },
  rose:    { dotColor: "bg-rose-500",        bgTint: "bg-rose-500/10",           textColor: "text-rose-700", iconColor: "text-rose-600" },
  orange:  { dotColor: "bg-orange-500",      bgTint: "bg-orange-500/10",         textColor: "text-orange-700", iconColor: "text-orange-600" },
  yellow:  { dotColor: "bg-yellow-500",      bgTint: "bg-yellow-500/10",         textColor: "text-yellow-700", iconColor: "text-yellow-600" },
  lime:    { dotColor: "bg-lime-500",        bgTint: "bg-lime-500/10",           textColor: "text-lime-700", iconColor: "text-lime-600" },
  teal:    { dotColor: "bg-teal-500",        bgTint: "bg-teal-500/10",           textColor: "text-teal-700", iconColor: "text-teal-600" },
  indigo:  { dotColor: "bg-indigo-500",      bgTint: "bg-indigo-500/10",         textColor: "text-indigo-700", iconColor: "text-indigo-600" },
  violet:  { dotColor: "bg-violet-500",      bgTint: "bg-violet-500/10",         textColor: "text-violet-700", iconColor: "text-violet-600" },
  fuchsia: { dotColor: "bg-fuchsia-500",     bgTint: "bg-fuchsia-500/10",        textColor: "text-fuchsia-700", iconColor: "text-fuchsia-600" },
  pink:    { dotColor: "bg-pink-500",        bgTint: "bg-pink-500/10",           textColor: "text-pink-700", iconColor: "text-pink-600" },
  stone:   { dotColor: "bg-stone-500",       bgTint: "bg-stone-500/10",          textColor: "text-stone-700", iconColor: "text-stone-600" },
  neutral: { dotColor: "bg-neutral-500",     bgTint: "bg-neutral-500/10",        textColor: "text-neutral-700", iconColor: "text-neutral-600" },
  zinc:    { dotColor: "bg-zinc-500",        bgTint: "bg-zinc-500/10",           textColor: "text-zinc-700", iconColor: "text-zinc-600" },
};

export interface TwentyOption {
  label: string;
  value: string;
  color: string;
}

/** Map raw Twenty SELECT options to StatusSelect format (lowercase values) */
export function mapTwentyOptions(twentyOptions: TwentyOption[]): StatusOption[] {
  return twentyOptions.map((opt) => {
    const color = COLOR_MAP[opt.color?.toLowerCase() ?? ""] ?? COLOR_MAP.gray;
    return {
      value: opt.value.toLowerCase(),
      label: opt.label,
      dotColor: color.dotColor,
      bgTint: color.bgTint,
      textColor: color.textColor,
      iconColor: color.iconColor,
    };
  });
}

/**
 * Twenty coldCallStatus options -> the list's status options, through the
 * shared contact-status pipeline (INTERESTED -> "interested", CALLBACK ->
 * "callback", older QUALIFIED/BOOKED/LOST aliases included). Options the
 * pipeline does not know are dropped rather than read as the first option.
 */
export function mapLeadProspectStatusOptions(twentyOptions: TwentyOption[]): StatusOption[] {
  return twentyOptions.flatMap((opt) => {
    const status = toContactStatus(opt.value);
    if (!status) return [];
    const color = COLOR_MAP[opt.color?.toLowerCase() ?? ""] ?? COLOR_MAP.gray;
    return [{
      value: toLegacyStatus(status),
      label: opt.label,
      dotColor: color.dotColor,
      bgTint: color.bgTint,
      textColor: color.textColor,
      iconColor: color.iconColor,
    }];
  });
}

/**
 * Map Twenty campaign status options to frontend display values.
 * Backend maps: ACTIVE→active, INACTIVE→paused, DRAFT→draft
 */
export function mapCampaignStatusOptions(twentyOptions: TwentyOption[]): StatusOption[] {
  const STATUS_MAP: Record<string, string> = {
    "ACTIVE": "active",
    "INACTIVE": "paused",
    "DRAFT": "draft",
  };

  return twentyOptions
    .filter((opt) => STATUS_MAP[opt.value.toUpperCase()] !== undefined)
    .map((opt) => {
      const color = COLOR_MAP[opt.color?.toLowerCase() ?? ""] ?? COLOR_MAP.gray;
      return {
        value: STATUS_MAP[opt.value.toUpperCase()],
        label: opt.label,
        dotColor: color.dotColor,
        bgTint: color.bgTint,
        textColor: color.textColor,
        iconColor: color.iconColor,
      };
    });
}

/** Tailwind dot class for a Twenty option colour name ("sky" falls back to gray). */
export function twentyDotClass(color: string | null | undefined): string {
  return (COLOR_MAP[String(color ?? "").toLowerCase()] ?? COLOR_MAP.gray).dotColor;
}
