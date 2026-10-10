import { twentyGraphqlClient } from "../graphql/index.js";
import { createLogger } from "../../logger/index.js";
import { lastOutcomes, type CallStub } from "./helpers/index.js";

export * from "./helpers/index.js";

const log = createLogger("last-call");

/** Calls are walked newest first (createdAt, as the Last call column orders them), 200 a page, at most this many pages. */
const PAGE = 200;
const MAX_PAGES = 50;
/** The Contacts table asks often (facets, every filter change); calls change slowly. */
const TTL_MS = 30_000;

let cached: { at: number; value: Promise<Map<string, string>> } | null = null;

async function load(): Promise<Map<string, string>> {
  const client: any = twentyGraphqlClient();
  const calls: CallStub[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const r: any = await client.query({
      agencyCalls: {
        __args: { first: PAGE, offset: page * PAGE, orderBy: [{ createdAt: "DescNullsLast" }, { id: "AscNullsFirst" }] },
        edges: { node: { agencyProspectId: true, agencyLeadId: true, disposition: true, status: true } },
      },
    });
    const nodes = (r?.agencyCalls?.edges ?? []).map((e: any) => e.node as CallStub);
    calls.push(...nodes);
    if (nodes.length < PAGE) break;
    if (page === MAX_PAGES - 1) log.info(`Last-call index stopped at ${calls.length} calls`);
  }
  return lastOutcomes(calls);
}

/**
 * Contact id -> how its most recent call ended, for every contact that has
 * been called. Cached for 30 seconds; `fresh` drops the cache (after a call
 * is saved, so the filter reflects it).
 */
export function lastCallIndex(fresh = false): Promise<Map<string, string>> {
  if (!fresh && cached && Date.now() - cached.at < TTL_MS) return cached.value;
  const value = load();
  cached = { at: Date.now(), value };
  value.catch(() => {
    if (cached?.value === value) cached = null;
  });
  return value;
}

/** Drop the cache: the next Contacts request sees a call saved just now. */
export function forgetLastCalls(): void {
  cached = null;
}
