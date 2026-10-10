/*
 * Small request-parsing helpers for the Contacts endpoints. The table query
 * itself (search, filters, sort, offset window) lives in query-gql.ts.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function list(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  return raw
    .split("|")
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, 50);
}

/** Contact type filter: "prospect", "lead" or both. */
export function contactTypes(raw: unknown): { prospects: boolean; leads: boolean } {
  const types = list(raw).map((t) => t.toLowerCase());
  if (types.length === 0) return { prospects: true, leads: true };
  return { prospects: types.includes("prospect"), leads: types.includes("lead") };
}

/** Validated ids for a lookup, at most 200. */
export function idList(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  return [...new Set(raw.split(",").map((s) => s.trim()).filter((s) => UUID.test(s)))].slice(0, 200);
}
