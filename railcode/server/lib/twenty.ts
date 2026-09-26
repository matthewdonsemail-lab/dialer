import { connector } from "@railcode/sdk";

// Twenty access for the dialer worker. Twenty is prebuilt into the org as the
// `twenty` HTTP connector (bearer), so the worker never holds an API key —
// every call below goes through the connector proxy, declared in
// manifest.yaml as `connectors: { twenty: ["*"] }`.
//
// IMPORTANT: the connector's base URL already ends in `/rest`, so paths here
// must NOT include a `/rest` prefix (that produces `/rest/rest/...`).

const twenty = () => connector("twenty");

export function twentyError(message: string, status = 500): Error & { status?: number } {
  const err = new Error(message) as Error & { status?: number };
  err.status = status;
  return err;
}

function toCamelCase(str: string): string {
  return str.replace(/[-_]([a-z])/g, (_, c: string) => c.toUpperCase());
}

function toSingular(str: string): string {
  if (str.endsWith("ies")) return str.slice(0, -3) + "y";
  if (str.endsWith("s") && !str.endsWith("ss")) return str.slice(0, -1);
  return str;
}

function toPascalCase(str: string): string {
  const camel = toCamelCase(str);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

export function unwrapTwentyList<T>(payload: any, path: string): T[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  const data = payload.data?.data ? payload.data.data : payload.data;
  if (!data) {
    if (Array.isArray(payload.rows)) return payload.rows;
    return [];
  }
  if (Array.isArray(data)) return data;
  const cleanPath = path.replace(/^\//, "").split("?")[0].split("/")[0];
  const objectName = toCamelCase(cleanPath);
  const singularName = toSingular(objectName);
  if (Array.isArray(data[objectName])) return data[objectName];
  if (Array.isArray(data[cleanPath])) return data[cleanPath];
  if (Array.isArray(data[singularName])) return data[singularName];
  if (Array.isArray(data.rows)) return data.rows;
  if (Array.isArray(data.edges)) {
    return data.edges.map((e: any) => e?.node).filter((n: any): n is T => n !== undefined);
  }
  for (const key of Object.keys(data)) {
    if (Array.isArray(data[key])) return data[key];
  }
  return [];
}

export function unwrapTwentyItem<T>(payload: any, path: string): T {
  if (!payload) return payload;
  const data = payload.data?.data ? payload.data.data : (payload.data ?? payload);
  const cleanPath = path.replace(/^\//, "").split("?")[0].split("/")[0];
  const objectName = toCamelCase(cleanPath);
  const singularName = toSingular(objectName);
  const pascalSingular = toPascalCase(singularName);
  let record: any = null;
  if (data && typeof data === "object") {
    if (data[singularName] && typeof data[singularName] === "object") {
      record = data[singularName];
    } else if (data[objectName] && typeof data[objectName] === "object" && !Array.isArray(data[objectName])) {
      record = data[objectName];
    } else if (data[`create${pascalSingular}`] && typeof data[`create${pascalSingular}`] === "object") {
      record = data[`create${pascalSingular}`];
    } else if (data[`update${pascalSingular}`] && typeof data[`update${pascalSingular}`] === "object") {
      record = data[`update${pascalSingular}`];
    } else if ("id" in data) {
      record = data;
    } else {
      for (const val of Object.values(data)) {
        if (val && typeof val === "object" && "id" in (val as object)) {
          record = val;
          break;
        }
      }
    }
  }
  return ((record || data || payload) as T);
}

async function twentyFetch(path: string, init: { method?: string; body?: string } = {}): Promise<any> {
  let res;
  try {
    res = await twenty().fetch(path, {
      method: init.method || "GET",
      ...(init.body !== undefined ? { body: init.body } : {}),
    });
  } catch (e: any) {
    throw twentyError(`Twenty connector call failed: ${e?.message || e}`, 502);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => `status ${res.status}`);
    throw twentyError(`Twenty request failed: ${res.status} ${text.slice(0, 300)}`, res.status >= 500 ? 502 : res.status);
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function listTwenty<T = any>(path: string, limitOrOptions: number | { limit?: number; filter?: string | Record<string, unknown> } = 100): Promise<T[]> {
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  const params = new URLSearchParams();
  if (typeof limitOrOptions === "number") {
    params.set("limit", String(limitOrOptions));
  } else {
    if (limitOrOptions.limit) params.set("limit", String(limitOrOptions.limit));
    if (limitOrOptions.filter) {
      params.set("filter", typeof limitOrOptions.filter === "string" ? limitOrOptions.filter : JSON.stringify(limitOrOptions.filter));
    }
  }
  const q = params.toString();
  const json = await twentyFetch(`/${cleanPath}${q ? `?${q}` : ""}`);
  return unwrapTwentyList<T>(json, cleanPath);
}

export interface TwentyPage<T = any> {
  records: T[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
  totalCount: number;
}

/** One keyset page from Twenty REST.
 *
 *  This Twenty version ignores cursor params (startingAfter/offset/page all
 *  return page 1) and caps limit at 200, so paging walks `id` strictly
 *  ascending: `orderBy=id[AscNullsFirst]` + `filter=id[gt]:<last seen id>`.
 *  IDs are unique, so pages are disjoint and the walk always terminates.
 *  `startingAfter` here is the last-seen record id (not a Twenty cursor).
 */
export async function listTwentyPage<T = any>(
  path: string,
  options: { limit?: number; filter?: string | Record<string, unknown>; startingAfter?: string } = {},
): Promise<TwentyPage<T>> {
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  const params = new URLSearchParams();
  params.set("limit", String(Math.min(Math.max(options.limit ?? 200, 1), 200)));
  params.set("orderBy", "id[AscNullsFirst]");
  if (options.startingAfter) {
    params.set("filter", `id[gt]:"${options.startingAfter}"`);
  } else if (options.filter) {
    params.set("filter", typeof options.filter === "string" ? options.filter : JSON.stringify(options.filter));
  }
  const json = await twentyFetch(`/${cleanPath}?${params.toString()}`);
  const records = unwrapTwentyList<T>(json, cleanPath);
  const ids = records.map((r: any) => r?.id).filter((id: any) => typeof id === "string");
  return {
    records,
    pageInfo: {
      // Full page ⇒ maybe more. A short/empty page ends the walk.
      hasNextPage: records.length >= parseInt(params.get("limit") || "200", 10),
      endCursor: ids.length > 0 ? ids[ids.length - 1] : null,
    },
    totalCount: typeof json?.totalCount === "number" ? json.totalCount : 0,
  };
}

export async function getTwenty<T = any>(path: string, id: string): Promise<T> {
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  const json = await twentyFetch(`/${cleanPath}/${encodeURIComponent(id)}`);
  return unwrapTwentyItem<T>(json, cleanPath);
}

export async function createTwenty<T = any>(path: string, data: any): Promise<T> {
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  const json = await twentyFetch(`/${cleanPath}`, { method: "POST", body: JSON.stringify(data) });
  return unwrapTwentyItem<T>(json, cleanPath);
}

export async function updateTwenty<T = any>(path: string, id: string, data: any): Promise<T> {
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  const json = await twentyFetch(`/${cleanPath}/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(data) });
  return unwrapTwentyItem<T>(json, cleanPath);
}

export async function deleteTwenty(path: string, id: string): Promise<void> {
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  await twentyFetch(`/${cleanPath}/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** GET Twenty metadata (e.g. "/metadata/objects" — no /rest prefix, see note above). */
export async function fetchTwentyMeta<T = any>(path: string): Promise<T> {
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  return twentyFetch(`/${cleanPath}`);
}

/** POST a GraphQL mutation/query against Twenty's /graphql endpoint. */
export async function twentyGraphQL<T = any>(query: string): Promise<T> {
  const json = await twentyFetch(`/graphql`, { method: "POST", body: JSON.stringify({ query }) });
  if (json.errors?.length > 0) throw twentyError(`Twenty GraphQL errors: ${JSON.stringify(json.errors).slice(0, 300)}`, 502);
  return json.data as T;
}
