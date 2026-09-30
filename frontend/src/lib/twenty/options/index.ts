import type { StatusOption } from "@/components/common/StatusSelect";

const COLOR_MAP: Record<string, { dotColor: string; bgTint: string; textColor: string }> = {
  green:   { dotColor: "bg-green-500",       bgTint: "bg-green-500/10",          textColor: "text-green-700" },
  red:     { dotColor: "bg-red-500",         bgTint: "bg-red-500/10",            textColor: "text-red-700" },
  gray:    { dotColor: "bg-gray-500",        bgTint: "bg-gray-500/10",           textColor: "text-gray-700" },
  amber:   { dotColor: "bg-amber-500",       bgTint: "bg-amber-500/10",          textColor: "text-amber-700" },
  blue:    { dotColor: "bg-blue-500",        bgTint: "bg-blue-500/10",           textColor: "text-blue-700" },
  emerald: { dotColor: "bg-emerald-500",     bgTint: "bg-emerald-500/10",        textColor: "text-emerald-700" },
  purple:  { dotColor: "bg-purple-500",      bgTint: "bg-purple-500/10",         textColor: "text-purple-700" },
  cyan:    { dotColor: "bg-cyan-500",        bgTint: "bg-cyan-500/10",           textColor: "text-cyan-700" },
  slate:   { dotColor: "bg-slate-500",       bgTint: "bg-slate-500/10",          textColor: "text-slate-700" },
  rose:    { dotColor: "bg-rose-500",        bgTint: "bg-rose-500/10",           textColor: "text-rose-700" },
  orange:  { dotColor: "bg-orange-500",      bgTint: "bg-orange-500/10",         textColor: "text-orange-700" },
  yellow:  { dotColor: "bg-yellow-500",      bgTint: "bg-yellow-500/10",         textColor: "text-yellow-700" },
  lime:    { dotColor: "bg-lime-500",        bgTint: "bg-lime-500/10",           textColor: "text-lime-700" },
  teal:    { dotColor: "bg-teal-500",        bgTint: "bg-teal-500/10",           textColor: "text-teal-700" },
  indigo:  { dotColor: "bg-indigo-500",      bgTint: "bg-indigo-500/10",         textColor: "text-indigo-700" },
  violet:  { dotColor: "bg-violet-500",      bgTint: "bg-violet-500/10",         textColor: "text-violet-700" },
  fuchsia: { dotColor: "bg-fuchsia-500",     bgTint: "bg-fuchsia-500/10",        textColor: "text-fuchsia-700" },
  pink:    { dotColor: "bg-pink-500",        bgTint: "bg-pink-500/10",           textColor: "text-pink-700" },
  stone:   { dotColor: "bg-stone-500",       bgTint: "bg-stone-500/10",          textColor: "text-stone-700" },
  neutral: { dotColor: "bg-neutral-500",     bgTint: "bg-neutral-500/10",        textColor: "text-neutral-700" },
  zinc:    { dotColor: "bg-zinc-500",        bgTint: "bg-zinc-500/10",           textColor: "text-zinc-700" },
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
    };
  });
}

/**
 * Apply the same field-name mapping as the backend for leads/prospects.
 * Backend maps: QUALIFIED→interested, BOOKED→callback, LOST→not_interested, etc.
 */
export function mapLeadProspectStatusOptions(twentyOptions: TwentyOption[]): StatusOption[] {
  const STATUS_MAP: Record<string, string> = {
    "NEW": "new",
    "CONTACTED": "contacted",
    "QUALIFIED": "interested",
    "BOOKED": "callback",
    "CONVERTED": "converted",
    "LOST": "not_interested",
    "DO_NOT_CONTACT": "not_interested",
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
      };
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
      };
    });
}
