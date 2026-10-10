import { HEIGHT, RADIUS, TEXT } from "@/domains/ui/tokens";

/** Text input and textarea class: 8px radius, 14px text, strong border, brand focus. */
export const inputClass = `w-full ${HEIGHT.md} ${RADIUS.control} border border-[var(--ods-border-strong)] bg-[var(--ods-bg-primary)] px-3 ${TEXT.input} text-[var(--ods-text-primary)] outline-none focus:border-[var(--ods-brand-500)] placeholder:text-[var(--ods-text-tertiary)]`;

/** Multi-line version: same frame, height from rows. */
export const textareaClass = `w-full ${RADIUS.control} border border-[var(--ods-border-strong)] bg-[var(--ods-bg-primary)] px-3 py-2 ${TEXT.input} leading-5 text-[var(--ods-text-primary)] outline-none focus:border-[var(--ods-brand-500)] placeholder:text-[var(--ods-text-tertiary)]`;
