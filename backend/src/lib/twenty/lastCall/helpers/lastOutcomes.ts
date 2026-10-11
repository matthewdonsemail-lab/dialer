/** One agencyCall, as much as the last-call index needs. */
export interface CallStub {
  agencyProspectId?: string | null;
  agencyLeadId?: string | null;
  disposition?: string | null;
  status?: string | null;
}

/** "Never called": the filter value for contacts with no call at all. */
export const NEVER_CALLED = "__never";

/**
 * Contact id -> how its most recent call ended (the disposition, else the
 * system result, as the Last call column shows it). `calls` must be newest
 * first; the first call seen for a contact wins. Pure.
 */
export function lastOutcomes(calls: CallStub[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const c of calls) {
    const owner = c.agencyProspectId || c.agencyLeadId;
    if (!owner || out.has(owner)) continue;
    out.set(owner, c.disposition || c.status || "UNKNOWN");
  }
  return out;
}

/** Outcome -> number of contacts whose last call ended that way. Pure. */
export function outcomeCounts(last: Map<string, string>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const outcome of last.values()) out[outcome] = (out[outcome] ?? 0) + 1;
  return out;
}

/**
 * Sort contacts by when they were last called: most recent first ("desc") or
 * least recent first ("asc"). `newestFirst` is every called contact id, newest
 * call first; `callKey` says which id a contact's calls are logged on (a
 * person's are on their company). Contacts never called come last either way,
 * in their original order. Pure.
 */
export function sortByLastCall<T>(items: T[], callKey: (item: T) => string | null | undefined, newestFirst: string[], dir: "asc" | "desc"): T[] {
  const rank = new Map(newestFirst.map((id, i) => [id, i]));
  const sign = dir === "asc" ? -1 : 1;
  const keyed = items.map((item, i) => {
    const key = callKey(item);
    return { item, i, r: key ? rank.get(key) : undefined };
  });
  keyed.sort((a, b) => {
    if (a.r === undefined || b.r === undefined) return a.r === undefined && b.r === undefined ? a.i - b.i : a.r === undefined ? 1 : -1;
    return (a.r - b.r) * sign || a.i - b.i;
  });
  return keyed.map((k) => k.item);
}
