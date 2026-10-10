import { HEIGHT, RADIUS, TEXT } from "../tokens";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "danger-soft" | "call";
export type ButtonSize = keyof typeof HEIGHT;

const BASE = `${RADIUS.control} ${TEXT.body} font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--ods-brand-500)]`;

const VARIANT: Record<ButtonVariant, string> = {
  /** The one main action in an area. */
  primary: "bg-[var(--ods-brand-600)] hover:bg-[var(--ods-brand-700)] text-white",
  /** Every other action: brand-tinted, like the ListeningKit dashboard's "gray" button. */
  secondary:
    "border border-[var(--ods-brand-600)]/15 bg-[var(--ods-brand-50)] hover:bg-[var(--ods-brand-100)] text-[var(--ods-brand-700)] dark:bg-[var(--ods-brand-600)]/15 dark:hover:bg-[var(--ods-brand-600)]/25 dark:text-[var(--ods-brand-300)]",
  /** Quiet actions (Cancel, Clear, Undo) and icon buttons in toolbars. */
  ghost: "hover:bg-[var(--ods-hover)] text-[var(--ods-text-secondary)] hover:text-[var(--ods-text-primary)]",
  /** The live call's End call: solid red, impossible to miss. */
  danger: "bg-red-600 hover:bg-red-700 text-white",
  /** Delete and remove inside forms and menus: tinted red. */
  "danger-soft": "bg-red-500/10 hover:bg-red-500/20 text-red-700 dark:text-red-300",
  /** Start a call. Green means "phone" everywhere in the app. */
  call: "bg-emerald-600 hover:bg-emerald-700 text-white",
};

const PADDING: Record<ButtonSize, string> = { sm: "px-2.5", md: "px-3", lg: "px-4" };
const SQUARE: Record<ButtonSize, string> = { sm: "w-8", md: "w-9", lg: "w-11" };

/** Class names for a button, also usable on <a> and <Link>. */
export function buttonClass({
  variant = "secondary",
  size = "md",
  iconOnly = false,
  block = false,
}: { variant?: ButtonVariant; size?: ButtonSize; iconOnly?: boolean; block?: boolean } = {}): string {
  return [BASE, VARIANT[variant], HEIGHT[size], iconOnly ? `${SQUARE[size]} shrink-0` : PADDING[size], block ? "w-full" : ""].filter(Boolean).join(" ");
}
