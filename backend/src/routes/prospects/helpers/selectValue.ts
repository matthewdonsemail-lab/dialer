// Twenty SELECT fields may arrive as a plain string value or as { value, label }. Pure.
export function selectValue(v: unknown): string | undefined {
  if (typeof v === "string") return v || undefined;
  if (v && typeof v === "object") {
    const o = v as { value?: unknown; label?: unknown };
    if (typeof o.value === "string" && o.value) return o.value;
    if (typeof o.label === "string" && o.label) return o.label;
  }
  return undefined;
}
