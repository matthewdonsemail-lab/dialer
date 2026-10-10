import type { ReactNode } from "react";
import type { Machine, Tone } from "@dialer/shared";
import { Chip } from "@/components/ui/Chip";
import type { IconComponent } from "@/components/ui/icons";
import { TONE_DOT } from "../tokens";

/**
 * Read-only status: the gray chip with a tone dot (or an FA6 icon). Use it
 * for any short value that should stand out from body text: a state, a
 * count, a country, a source.
 */
export function Pill({ tone = "neutral", icon, title, children }: { tone?: Tone; icon?: IconComponent; title?: string; children: ReactNode }) {
  return icon ? (
    <Chip icon={icon} title={title}>
      {children}
    </Chip>
  ) : (
    <Chip dot={TONE_DOT[tone]} title={title}>
      {children}
    </Chip>
  );
}

/** A pipeline state as a pill, labelled and coloured by its machine. */
export function StatePill<S extends string>({ machine, value }: { machine: Machine<S>; value: unknown }) {
  const state = machine.parse(value);
  if (!state) return <Pill tone="neutral">{String(value ?? "Unknown")}</Pill>;
  const def = machine.def(state);
  return (
    <Pill tone={def.tone} title={def.description}>
      {def.label}
    </Pill>
  );
}
