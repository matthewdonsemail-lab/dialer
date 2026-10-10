import type { Machine, MachineSpec, TransitionResult } from "../types.js";

/** Builds a pipeline from its declared states. Pure; no I/O. */
export function createMachine<S extends string>(spec: MachineSpec<S>): Machine<S> {
  const states = Object.keys(spec.states) as S[];
  const known = new Set<string>(states);
  const overrides = new Set((spec.overrides ?? []).map(([from, to]) => `${from}>${to}`));

  const isState = (value: unknown): value is S => typeof value === "string" && known.has(value);

  const parse = (value: unknown): S | null => {
    if (value === null || value === undefined) return spec.initial;
    const raw = String(value).trim();
    if (!raw) return spec.initial;
    const upper = raw.toUpperCase().replace(/[\s-]+/g, "_");
    return isState(upper) ? upper : null;
  };

  const resolve = (from: S | null | undefined): S => from ?? spec.initial;

  const can = (from: S | null | undefined, to: S, options: { override?: boolean } = {}): boolean => {
    const f = resolve(from);
    if (f === to) return true;
    if (spec.states[f].next.includes(to)) return true;
    return !!options.override && overrides.has(`${f}>${to}`);
  };

  const transition = (fromValue: unknown, toValue: unknown, options: { override?: boolean } = {}): TransitionResult<S> => {
    const from = parse(fromValue) ?? spec.initial;
    const to = parse(toValue);
    if (to === null || toValue === null || toValue === undefined || String(toValue).trim() === "") {
      return { ok: false, from, to: null, reason: `"${String(toValue ?? "")}" is not a ${spec.field} value.` };
    }
    if (can(from, to, options)) return { ok: true, from, to, changed: from !== to };
    const fromDef = spec.states[from];
    const reason = fromDef.terminal
      ? `${fromDef.label} is final. ${overrides.has(`${from}>${to}`) ? "Reopen it first." : "It cannot be changed here."}`
      : `${fromDef.label} cannot move to ${spec.states[to].label}. Allowed next: ${fromDef.next.map((s) => spec.states[s].label).join(", ") || "none"}.`;
    return { ok: false, from, to, reason };
  };

  return {
    field: spec.field,
    initial: spec.initial,
    states,
    isState,
    state: (name) => name,
    parse,
    def: (state) => spec.states[state],
    label: (state) => (state && known.has(state) ? spec.states[state].label : "Unknown"),
    nextStates: (from) => [...spec.states[resolve(from)].next],
    can,
    transition,
  };
}
