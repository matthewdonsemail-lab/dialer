import type { Tone } from "@dialer/shared";

/*
 * The design scale. Every primitive takes its sizes from here, and
 * docs/design-system.md documents the same table. Do not add a value in a
 * screen; add it here (and to the doc) or use the nearest one.
 */

/** Corner radius by role. */
export const RADIUS = {
  /** Buttons, inputs, select triggers, icon buttons. */
  control: "rounded-[8px]",
  /** Pills, chips, avatars, small tiles, keypad keys. */
  chip: "rounded-md",
  /** Cards and sections. */
  card: "rounded-[10px]",
  /** Floating surfaces: the dialer dock, modals. */
  overlay: "rounded-[12px]",
} as const;

/** Type scale by role. Weights: 400 body, 600 for labels, values and buttons. */
export const TEXT = {
  /** Chips, meta lines, field labels, timestamps. */
  meta: "text-[12px]",
  /** Body copy, table cells, buttons, sentences. */
  body: "text-[13px]",
  /** Inputs and editable values. */
  input: "text-[14px]",
  /** List and card titles. */
  title: "text-[15px]",
  /** Page and section headings. */
  heading: "text-xl",
} as const;

/** Control heights. */
export const HEIGHT = { sm: "h-8", md: "h-9", lg: "h-11" } as const;

/** The one colour per pipeline tone: dots on pills, menus and timelines. */
export const TONE_DOT: Record<Tone, string> = {
  neutral: "bg-gray-400",
  info: "bg-sky-500",
  progress: "bg-blue-500",
  positive: "bg-emerald-500",
  negative: "bg-red-500",
  warning: "bg-amber-500",
};

/** Tinted surfaces for notices, by tone. */
export const TONE_SURFACE: Record<Tone, string> = {
  neutral: "bg-[var(--ods-bg-secondary)] border-[var(--ods-border)] text-[var(--ods-text-secondary)]",
  info: "bg-sky-500/10 border-sky-500/30 text-sky-800 dark:text-sky-200",
  progress: "bg-blue-500/10 border-blue-500/30 text-blue-800 dark:text-blue-200",
  positive: "bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-200",
  negative: "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300",
  warning: "bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-200",
};

/** In-app link: bold brand text, dashed underline, solid on hover (.ods-link in index.css). */
export const LINK = "ods-link";

/** Field label above a value, and the value itself. Values carry the weight, labels stay quiet. */
export const LABEL = "text-[12px] font-semibold text-[var(--ods-text-secondary)]";
export const VALUE = "text-[14px] font-semibold text-[var(--ods-text-primary)]";
