import type { Machine } from "@dialer/shared";
import { ChevronDown, Lock } from "@/domains/ui/icons";
import { SelectMenu, type MenuSection } from "@/domains/ui/menu";
import { HEIGHT, RADIUS, TEXT, TONE_DOT } from "@/domains/ui/tokens";

/**
 * Picks the next state of a pipeline (contact status, outreach stage…).
 * Built from the shared machine, so it offers exactly the moves the backend
 * accepts: allowed next states first, the rest shown disabled with the
 * reason, and a final state offering only its explicit reopen.
 *
 * Full width of its container by default: it is a field, not a badge.
 */
export function StateSelect<S extends string>({
  machine,
  value,
  onChange,
  disabled,
  block = true,
  title,
}: {
  machine: Machine<S>;
  value: S | null | undefined;
  /** `override` is true when the choice reopens a final state. */
  onChange: (next: S, options: { override: boolean }) => void;
  disabled?: boolean;
  block?: boolean;
  title?: string;
}) {
  const current = value ?? machine.initial;
  const def = machine.def(current);
  const allowed = new Set(machine.nextStates(current));
  const reopen = def.terminal ? machine.states.filter((s) => s !== current && machine.can(current, s, { override: true })) : [];

  const sections: MenuSection[] = [
    {
      title: "Current",
      options: [{ value: current, label: def.label, dot: TONE_DOT[def.tone], description: def.description }],
    },
  ];
  if (allowed.size) {
    sections.push({
      title: "Move to",
      options: machine.states
        .filter((s) => allowed.has(s))
        .map((s) => ({ value: s, label: machine.def(s).label, dot: TONE_DOT[machine.def(s).tone], description: machine.def(s).description })),
    });
  }
  if (reopen.length) {
    sections.push({
      title: "Reopen",
      options: reopen.map((s) => ({ value: s, label: `Reopen as ${machine.def(s).label}`, dot: TONE_DOT[machine.def(s).tone], description: "Undo the final state on purpose." })),
    });
  }
  const blocked = machine.states.filter((s) => s !== current && !allowed.has(s) && !reopen.includes(s));
  if (blocked.length) {
    sections.push({
      title: `Not from ${def.label}`,
      options: blocked.map((s) => ({
        value: s,
        label: machine.def(s).label,
        dot: TONE_DOT[machine.def(s).tone],
        disabled: true,
        description: def.terminal ? `${def.label} is final.` : `Not a next step from ${def.label}.`,
      })),
    });
  }

  return (
    <SelectMenu
      value={current}
      sections={sections}
      disabled={disabled}
      width={280}
      triggerTitle={title ?? def.description}
      onChange={(v) => {
        const next = v as S;
        if (next === current) return;
        onChange(next, { override: reopen.includes(next) });
      }}
      triggerClassName={`${block ? "w-full" : ""} ${HEIGHT.md} px-3 ${RADIUS.control} border border-[var(--ods-border-strong)] bg-[var(--ods-bg-primary)] hover:bg-[var(--ods-hover)] ${TEXT.input} font-semibold text-[var(--ods-text-primary)] inline-flex items-center gap-2 disabled:opacity-60`}
      trigger={
        <>
          <span className={`w-2.5 h-2.5 shrink-0 ${RADIUS.chip} ${TONE_DOT[def.tone]}`} aria-hidden="true" />
          <span className="flex-1 min-w-0 text-left truncate">{def.label}</span>
          {def.terminal && <Lock className="w-3 h-3 text-[var(--ods-text-tertiary)]" aria-label="Final" />}
          <ChevronDown className="w-3 h-3 opacity-60" aria-hidden="true" />
        </>
      }
    />
  );
}
