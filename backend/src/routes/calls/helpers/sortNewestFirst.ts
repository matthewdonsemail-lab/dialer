/** When a call happened: when it started, else when its row was made. */
function when(call: { startedAt?: string | null; created_at?: string | null }): number {
  const t = Date.parse(call.startedAt || call.created_at || "");
  return Number.isNaN(t) ? 0 : t;
}

/** Calls newest first by start time (rows without a time go last). Pure. */
export function sortNewestFirst<T extends { startedAt?: string | null; created_at?: string | null }>(calls: T[]): T[] {
  return [...calls].sort((a, b) => when(b) - when(a));
}
