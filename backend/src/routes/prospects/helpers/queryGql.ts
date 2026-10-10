/*
 * GraphQL form of the Contacts table query. Twenty's REST API pages by
 * cursor only; GraphQL also takes an `offset`, which is what lets the table
 * fetch any slice of the list (e.g. after the user drags the scrollbar to the
 * middle) instead of walking every page before it, the way Twenty's own
 * record table does.
 */

const STATUS_TO_TWENTY: Record<string, string> = {
  new: "NEW",
  contacted: "CONTACTED",
  interested: "INTERESTED",
  not_interested: "NOT_INTERESTED",
  callback: "CALLBACK",
  converted: "CONVERTED",
  do_not_contact: "DO_NOT_CONTACT",
};

const PROSPECT_SORT: Record<string, string> = {
  name: "name",
  company: "niche",
  industry: "niche",
  status: "coldCallStatus",
  state: "region",
  city: "city",
  country: "country",
  phone: "phone",
  created: "createdAt",
};

// agencyLead has no company / place / industry fields in this workspace.
const LEAD_SORT: Record<string, string> = { name: "name", status: "coldCallStatus", created: "createdAt" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function list(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  return raw
    .split("|")
    .map((v) => v.trim().slice(0, 120))
    .filter(Boolean)
    .slice(0, 50);
}

type Filter = Record<string, unknown>;

function statusFilter(raw: unknown): Filter | null {
  const statuses = list(raw)
    .map((s) => STATUS_TO_TWENTY[s.toLowerCase()])
    .filter(Boolean);
  if (!statuses.length) return null;
  const clauses: Filter[] = [{ coldCallStatus: { in: statuses } }];
  if (statuses.includes("NEW")) clauses.push({ coldCallStatus: { is: "NULL" } });
  return clauses.length > 1 ? { or: clauses } : clauses[0];
}

/** `field in values`, where "__blank" also matches an empty field. */
function inOrBlank(field: string, values: string[]): Filter | null {
  if (!values.length) return null;
  const named = values.filter((v) => v !== "__blank");
  const clauses: Filter[] = named.length ? [{ [field]: { in: named } }] : [];
  if (values.includes("__blank")) clauses.push({ or: [{ [field]: { is: "NULL" } }, { [field]: { eq: "" } }] });
  return clauses.length > 1 ? { or: clauses } : clauses[0];
}

function contains(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().slice(0, 120) : "";
}

/**
 * Ids from the last-call filter: only these (`in`), or all but these
 * (`notIn`, for "Never called"). Resolved by the route from the call index.
 */
export interface IdScope {
  in?: string[];
  notIn?: string[];
}

function idScope(scope?: IdScope): Filter | null {
  if (scope?.in) return { id: { in: scope.in } };
  if (scope?.notIn?.length) return { not: { id: { in: scope.notIn } } };
  return null;
}

/** Column filters only prospects have (no such field on agencyLead). */
const PROSPECT_ONLY = ["country", "industry", "company", "state", "city"];

function orderBy(params: Record<string, unknown>, fields: Record<string, string>): Record<string, string>[] {
  const field = fields[typeof params.sort === "string" ? params.sort : ""] ?? "createdAt";
  const dir = params.dir === "asc" ? "AscNullsLast" : params.dir === "desc" ? "DescNullsLast" : field === "createdAt" ? "DescNullsLast" : "AscNullsLast";
  // Tie-break on id so rows never swap between pages.
  return [{ [field]: dir }, { id: "AscNullsFirst" }];
}

function combine(parts: Filter[]): Filter | undefined {
  return parts.length === 0 ? undefined : parts.length === 1 ? parts[0] : { and: parts };
}

/** Values are passed as GraphQL variables, never spliced into a query string. */
export function prospectGqlQuery(params: Record<string, unknown>, scope?: IdScope) {
  const parts: Filter[] = [];
  const text = typeof params.q === "string" ? params.q.trim().slice(0, 120) : "";
  if (text) {
    const like = `%${text}%`;
    parts.push({ or: ["name", "niche", "city", "region", "country", "phone", "email"].map((f) => ({ [f]: { ilike: like } })) });
  }
  const status = statusFilter(params.status);
  if (status) parts.push(status);
  const name = contains(params.name);
  if (name) parts.push({ name: { ilike: `%${name}%` } });
  const phone = contains(params.phone);
  if (phone) parts.push({ phone: { ilike: `%${phone}%` } });
  for (const [param, field] of [["country", "country"], ["industry", "niche"], ["company", "niche"], ["state", "region"], ["city", "city"]]) {
    const clause = inOrBlank(field, list(params[param]));
    if (clause) parts.push(clause);
  }
  const ids = idScope(scope);
  if (ids) parts.push(ids);
  if (typeof params.campaign === "string" && UUID.test(params.campaign)) parts.push({ campaignIdId: { eq: params.campaign } });
  return { filter: combine(parts), orderBy: orderBy(params, PROSPECT_SORT) };
}

/** Lead version; null when a prospect-only filter (country, industry, place) is set. */
export function leadGqlQuery(params: Record<string, unknown>, scope?: IdScope) {
  if (PROSPECT_ONLY.some((k) => list(params[k]).length)) return null;
  const parts: Filter[] = [];
  const text = typeof params.q === "string" ? params.q.trim().slice(0, 120) : "";
  if (text) parts.push({ or: ["name", "contactName"].map((f) => ({ [f]: { ilike: `%${text}%` } })) });
  const name = contains(params.name);
  if (name) parts.push({ or: ["name", "contactName"].map((f) => ({ [f]: { ilike: `%${name}%` } })) });
  const phone = contains(params.phone);
  if (phone) parts.push({ phone: { primaryPhoneNumber: { ilike: `%${phone}%` } } });
  const ids = idScope(scope);
  if (ids) parts.push(ids);
  const status = statusFilter(params.status);
  if (status) parts.push(status);
  if (typeof params.campaign === "string" && UUID.test(params.campaign)) parts.push({ campaignIdId: { eq: params.campaign } });
  return { filter: combine(parts), orderBy: orderBy(params, LEAD_SORT) };
}

/** Window requested by the table: offset 0..∞, limit 1..200. */
export function pageWindow(params: Record<string, unknown>) {
  const offset = Math.max(0, Number.parseInt(String(params.offset ?? "0"), 10) || 0);
  const limit = Math.min(200, Math.max(1, Number.parseInt(String(params.limit ?? "50"), 10) || 50));
  return { offset, limit };
}
