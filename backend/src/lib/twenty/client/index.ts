import { createLogger } from "../../logger/index.js";
import { twentyFetch } from "../throttle/index.js";
import type { WriteActor } from "../actor/index.js";

export type { WriteActor };

/**
 * Merge actor fields into a record payload. Actor fields are read-mostly
 * system fields, so only set them when present and not already on the
 * payload — this keeps the write safe for objects that reject them.
 */
function withActor(data: any, actor: WriteActor | null | undefined): any {
  if (!actor) return data;
  const out: any = { ...data };
  if (actor.createdBy && !out.createdBy) out.createdBy = actor.createdBy;
  return out;
}

const log = createLogger('twenty-client');

/**
 * Core SDK Primitives & Interfaces matching Twenty's client contracts
 */
export interface TwentyPageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor?: string | null;
  endCursor?: string | null;
}

export interface TwentyListResponse<T> {
  data: Record<string, T[]> | T[];
  totalCount?: number;
  pageInfo?: TwentyPageInfo;
}

export interface TwentyItemResponse<T> {
  data: Record<string, T> | T;
}

export interface TwentyRecord {
  id: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface TwentyQueryOptions {
  limit?: number;
  startingAfter?: string;
  endingBefore?: string;
  query?: Record<string, string>;
  filter?: string | Record<string, unknown>;
  [key: string]: unknown;
}

interface SyncConfig {
  twentyBaseUrl: string;
  twentyApiKey: string;
}

let config: SyncConfig | null = null;

export function loadSyncConfig(): SyncConfig {
  const baseUrl = process.env.TWENTY_BASE_URL;
  const apiKey = process.env.TWENTY_API_KEY;

  if (!baseUrl || !apiKey) {
    throw new Error(
      "TWENTY_BASE_URL and TWENTY_API_KEY environment variables are required"
    );
  }

  return {
    twentyBaseUrl: baseUrl.replace(/\/$/, ""),
    twentyApiKey: apiKey,
  };
}

function getConfig(): SyncConfig {
  if (!config) {
    config = loadSyncConfig();
  }
  return config;
}

/**
 * Converts kebab-case or snake_case string to camelCase
 */
function toCamelCase(str: string): string {
  return str.replace(/[-_]([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * Infers singular object key name (e.g. agencyProspects -> agencyProspect)
 */
function toSingular(str: string): string {
  if (str.endsWith("ies")) return str.slice(0, -3) + "y";
  if (str.endsWith("s") && !str.endsWith("ss")) return str.slice(0, -1);
  return str;
}

/**
 * Converts string to PascalCase for mutation action matching
 */
function toPascalCase(str: string): string {
  const camel = toCamelCase(str);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

/**
 * Extracts an array of records from any Twenty response envelope:
 * - Direct array: T[]
 * - Standard REST: { data: { agencyProspects: T[] } }
 * - Double nested / SDK envelope: { data: { data: { agencyProspects: T[] } } }
 * - Direct data array: { data: T[] }
 * - Fallbacks: data.rows, data.edges (GraphQL)
 */
export function unwrapTwentyList<T>(payload: any, path: string): T[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;

  const data = payload.data?.data ? payload.data.data : payload.data;
  if (!data) {
    if (Array.isArray(payload.rows)) return payload.rows;
    return [];
  }

  if (Array.isArray(data)) return data;

  const cleanPath = path.replace(/^\//, '').split('?')[0].split('/')[0];
  const objectName = toCamelCase(cleanPath);
  const singularName = toSingular(objectName);

  if (Array.isArray(data[objectName])) return data[objectName];
  if (Array.isArray(data[cleanPath])) return data[cleanPath];
  if (Array.isArray(data[singularName])) return data[singularName];
  if (Array.isArray(data.rows)) return data.rows;

  if (Array.isArray(data.edges)) {
    return data.edges
      .map((e: any) => e?.node)
      .filter((n: any): n is T => n !== undefined);
  }

  for (const key of Object.keys(data)) {
    if (Array.isArray(data[key])) {
      return data[key];
    }
  }

  return [];
}

/**
 * Extracts a single record from Twenty CRM query or mutation envelopes.
 * Handles nested singular keys and mutation prefixes (create/update),
 * while maintaining a non-enumerable `.data` property for existing routes.
 */
export function unwrapTwentyItem<T>(payload: any, path: string): T {
  if (!payload) return payload;

  const data = payload.data?.data ? payload.data.data : (payload.data ?? payload);
  const cleanPath = path.replace(/^\//, '').split('?')[0].split('/')[0];
  const objectName = toCamelCase(cleanPath);
  const singularName = toSingular(objectName);
  const pascalSingular = toPascalCase(singularName);

  let record: any = null;

  if (data && typeof data === 'object') {
    if (data[singularName] && typeof data[singularName] === 'object') {
      record = data[singularName];
    } else if (data[objectName] && typeof data[objectName] === 'object' && !Array.isArray(data[objectName])) {
      record = data[objectName];
    } else if (data[`create${pascalSingular}`] && typeof data[`create${pascalSingular}`] === 'object') {
      record = data[`create${pascalSingular}`];
    } else if (data[`update${pascalSingular}`] && typeof data[`update${pascalSingular}`] === 'object') {
      record = data[`update${pascalSingular}`];
    } else if ('id' in data) {
      record = data;
    } else {
      for (const val of Object.values(data)) {
        if (val && typeof val === 'object' && 'id' in val) {
          record = val;
          break;
        }
      }
    }
  }

  const finalRecord = record || data || payload;

  if (finalRecord && typeof finalRecord === 'object' && !finalRecord.data) {
    Object.defineProperty(finalRecord, 'data', {
      value: finalRecord,
      enumerable: false,
      configurable: true,
      writable: true,
    });
  }

  return finalRecord as T;
}

/**
 * Fetch raw data from Twenty CRM REST or Metadata API
 */
export async function fetchTwenty<T>(path: string, options?: TwentyQueryOptions): Promise<T> {
  const cfg = getConfig();
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  const basePath = `rest/${cleanPath}`;

  const url = new URL(`${cfg.twentyBaseUrl}/${basePath}`);

  if (options?.limit !== undefined) {
    url.searchParams.set("limit", String(options.limit));
  }
  if (options?.startingAfter) {
    url.searchParams.set("startingAfter", options.startingAfter);
  }
  if (options?.endingBefore) {
    url.searchParams.set("endingBefore", options.endingBefore);
  }
  if (options?.query) {
    Object.entries(options.query).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });
  }

  log.info(`Fetching ${url.toString()}`);

  const response = await twentyFetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${cfg.twentyApiKey}`,
      "Content-Type": "application/json",
    },
  });

  log.info(`Response: ${response.status} ${response.statusText}`);

  if (!response.ok) {
    const text = await response.text();
    log.error(`Error body:`, text.substring(0, 500));
    throw new Error(`Failed to fetch ${path}: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();
  log.debug(`Response keys:`, Object.keys(json));

  return json as T;
}

/**
 * Create a record in Twenty CRM and return the normalized entity primitive
 */
export async function createTwenty<T = TwentyRecord>(path: string, data: any, actor?: WriteActor | null): Promise<T> {
  const cfg = getConfig();
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  const url = `${cfg.twentyBaseUrl}/rest/${cleanPath}`;
  const payload = withActor(data, actor);

  log.info(`Creating ${cleanPath}:`, JSON.stringify(payload).substring(0, 200));

  const response = await twentyFetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.twentyApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  log.info(`Create response: ${response.status}`);

  if (!response.ok) {
    const text = await response.text();
    log.error(`Create error:`, text.substring(0, 500));
    throw new Error(`Failed to create ${cleanPath}: ${response.status} - ${text}`);
  }

  const json = await response.json();
  return unwrapTwentyItem<T>(json, cleanPath);
}

/**
 * Update a record in Twenty CRM and return the normalized entity primitive
 */
export async function updateTwenty<T = TwentyRecord>(path: string, id: string, data: any, actor?: WriteActor | null): Promise<T> {
  const cfg = getConfig();
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  const url = `${cfg.twentyBaseUrl}/rest/${cleanPath}/${encodeURIComponent(id)}`;
  const payload = withActor(data, actor);

  log.info(`Updating ${cleanPath}/${id}:`, JSON.stringify(payload).substring(0, 200));

  const response = await twentyFetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${cfg.twentyApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  log.info(`Update response: ${response.status}`);

  if (!response.ok) {
    const text = await response.text();
    log.error(`Update error:`, text.substring(0, 500));
    throw new Error(`Failed to update ${cleanPath}/${id}: ${response.status} - ${text}`);
  }

  const json = await response.json();
  return unwrapTwentyItem<T>(json, cleanPath);
}

/**
 * Execute a GraphQL mutation against Twenty's API (not metadata)
 */
export async function graphqlMutation<T>(mutation: string): Promise<T> {
  const cfg = getConfig();
  const url = `${cfg.twentyBaseUrl}/graphql`;

  log.info(`GraphQL mutation to ${url}`);

  const response = await twentyFetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.twentyApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: mutation }),
  });

  log.info(`GraphQL response: ${response.status}`);

  if (!response.ok) {
    const text = await response.text();
    log.error(`GraphQL error:`, text.substring(0, 500));
    throw new Error(`GraphQL error (${response.status}): ${text}`);
  }

  const json = await response.json();
  if (json.errors?.length > 0) {
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  }

  return json.data as T;
}

/**
 * Update a record via GraphQL (supports relation fields with connect/disconnect)
 */
export async function updateTwentyGraphQL<T>(objectName: string, id: string, data: any, actor?: WriteActor | null): Promise<T> {
  const camelCaseName = objectName.charAt(0).toUpperCase() + objectName.slice(1);
  const setFields = Object.entries(data)
    .map(([key, value]) => `${key}: ${JSON.stringify(value).replace(/"/g, '\\"')}`)
    .join(", ");

  // Twenty accepts the createdBy Actor in the data block.
  const actorFields: string[] = [];
  if (actor?.createdBy) {
    const a = actor.createdBy;
    actorFields.push(
      `createdBy: { source: ${JSON.stringify(a.source)}, workspaceMemberId: ${JSON.stringify(
        a.workspaceMemberId
      )}, name: ${JSON.stringify(a.name).replace(/"/g, '\\"')} }`
    );
  }
  const fields = [setFields, ...actorFields].filter(Boolean).join(", ");

  // This Twenty version names the mutation `update<Singular>` (e.g.
  // updateAgencyCall), not `updateOne<Singular>` — the latter does not
  // exist in the schema. Verified against the live introspection.
  const mutation = `
    mutation {
      update${camelCaseName}(id: "${id}"${fields ? `, data: { ${fields} }` : ""}) {
        id
      }
    }
  `;

  const result = await graphqlMutation<any>(mutation);
  log.info(`Updated ${objectName}/${id} via GraphQL`);
  return result as unknown as T;
}

/**
 * Delete a record from Twenty CRM
 */
export async function deleteTwenty(path: string, id: string): Promise<void> {
  const cfg = getConfig();
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  const url = `${cfg.twentyBaseUrl}/rest/${cleanPath}/${encodeURIComponent(id)}`;

  log.info(`Deleting ${cleanPath}/${id}`);

  const response = await twentyFetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${cfg.twentyApiKey}`,
    },
  });

  log.info(`Delete response: ${response.status}`);

  if (!response.ok && response.status !== 204) {
    const text = await response.text();
    log.error(`Delete error:`, text.substring(0, 500));
    throw new Error(`Failed to delete ${cleanPath}/${id}: ${response.status}`);
  }
}

/**
 * Get a single record from Twenty CRM
 */
export async function getTwenty<T = TwentyRecord>(path: string, id: string): Promise<T> {
  const cfg = getConfig();
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  const url = `${cfg.twentyBaseUrl}/rest/${cleanPath}/${encodeURIComponent(id)}`;

  log.info(`Getting ${url}`);

  const response = await twentyFetch(url, {
    headers: {
      Authorization: `Bearer ${cfg.twentyApiKey}`,
      "Content-Type": "application/json",
    },
  });

  log.info(`Get response: ${response.status}`);

  if (!response.ok) {
    const text = await response.text();
    log.error(`Failed to get ${cleanPath}/${id}: ${response.status} - ${text}`);
    throw new Error(`Failed to get ${cleanPath}/${id}: ${response.status}`);
  }

  const json = await response.json();
  log.info(`Raw Twenty response: ${JSON.stringify(json).substring(0, 500)}`);
  return unwrapTwentyItem<T>(json, cleanPath);
}

/**
 * Get all records from a Twenty object with optional limit
 */
export async function listTwenty<T = TwentyRecord>(path: string, limitOrOptions: number | TwentyQueryOptions = 100): Promise<T[]> {
  const cfg = getConfig();
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;

  log.info(`Listing ${cleanPath}`);

  const query: Record<string, string> = {};

  if (typeof limitOrOptions === "number") {
    query.limit = String(limitOrOptions);
  } else if (limitOrOptions && typeof limitOrOptions === "object") {
    if (limitOrOptions.limit) {
      query.limit = String(limitOrOptions.limit);
    }
    if (limitOrOptions.filter) {
      query.filter = typeof limitOrOptions.filter === "string"
        ? limitOrOptions.filter
        : JSON.stringify(limitOrOptions.filter);
    }
    if (limitOrOptions.query) {
      Object.assign(query, limitOrOptions.query);
    }
  }

  const response = await fetchTwenty<{
    data?: {
      [key: string]: unknown;
      rows?: T[];
      edges?: { node?: T }[];
    };
    totalCount?: number;
    pageInfo?: unknown;
  }>(path, { query });

  const records = unwrapTwentyList<T>(response, cleanPath);
  log.info(`Found ${records.length} records in ${cleanPath}`);
  return records;
}

export interface TwentyPage<T = TwentyRecord> {
  records: T[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
  totalCount: number;
}

/**
 * One keyset page from Twenty REST.
 *
 * This Twenty version ignores cursor params (startingAfter/offset/page all
 * return page 1) and caps limit at 200, so paging walks `id` strictly
 * ascending: `orderBy=id[AscNullsFirst]` + `filter=id[gt]:<last seen id>`.
 * IDs are unique, so pages are disjoint and the walk always terminates.
 * `startingAfter` here is the last-seen record id (not a Twenty cursor).
 */
export async function listTwentyPage<T = TwentyRecord>(
  path: string,
  options: { limit?: number; filter?: string | Record<string, unknown>; startingAfter?: string } = {},
): Promise<TwentyPage<T>> {
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  const limit = Math.min(Math.max(options.limit ?? 200, 1), 200);
  const query: Record<string, string> = {
    limit: String(limit),
    orderBy: "id[AscNullsFirst]",
  };
  if (options.startingAfter) {
    query.filter = `id[gt]:"${options.startingAfter}"`;
  } else if (options.filter) {
    query.filter = typeof options.filter === "string"
      ? options.filter
      : JSON.stringify(options.filter);
  }

  const response = await fetchTwenty<{
    data?: {
      [key: string]: unknown;
      rows?: T[];
      edges?: { node?: T }[];
    };
    totalCount?: number;
    pageInfo?: unknown;
  }>(path, { query });

  const records = unwrapTwentyList<T>(response, cleanPath);
  const ids = records.map((r: any) => r?.id).filter((id: any) => typeof id === "string");
  return {
    records,
    pageInfo: {
      // Full page ⇒ maybe more. A short/empty page ends the walk.
      hasNextPage: records.length >= limit,
      endCursor: ids.length > 0 ? ids[ids.length - 1] : null,
    },
    totalCount: typeof (response as any)?.totalCount === "number" ? (response as any).totalCount : 0,
  };
}

/**
 * Walk every page and return all records (guarded at 50 pages / ~10k rows).
 */
export async function listTwentyAll<T = TwentyRecord>(
  path: string,
  options: { filter?: string | Record<string, unknown> } = {},
): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | undefined;
  let guard = 0;
  for (;;) {
    const { records, pageInfo } = await listTwentyPage<T>(path, { ...options, startingAfter: cursor });
    all.push(...records);
    if (!pageInfo.hasNextPage || !pageInfo.endCursor || ++guard > 50) break;
    cursor = pageInfo.endCursor;
  }
  log.info(`Walked ${all.length} total records in ${path}`);
  return all;
}

// Export a client object with all methods for convenience
export const twentyClient = {
  fetch: fetchTwenty,
  create: createTwenty,
  update: updateTwenty,
  delete: deleteTwenty,
  get: getTwenty,
  list: listTwenty,
  listPage: listTwentyPage,
  listAll: listTwentyAll,
  graphqlMutation,
  updateGraphQL: updateTwentyGraphQL,
  loadSyncConfig,
  unwrapList: unwrapTwentyList,
  unwrapItem: unwrapTwentyItem,
};
