import { AsyncLocalStorage } from "node:async_hooks";
import { createLogger } from "../../logger/index.js";

const log = createLogger("twenty-throttle");

/**
 * Every request the backend sends to Twenty goes through here.
 *
 * Twenty limits an API key to 100 requests a minute and answers the 101st
 * with 429, which used to surface as a 500 on whatever the operator was
 * doing (saving a disposition, the next contact in the queue). So requests:
 *
 * - wait for a slot in a sliding one-minute window (TWENTY_REQUESTS_PER_MINUTE,
 *   default 90, leaving headroom for Twenty's own clock), instead of failing;
 * - share one answer when the same read is already in flight (two screens
 *   asking for /agencyCalls at the same moment cost one request);
 * - are retried with a pause if Twenty still answers 429.
 *
 * Two lanes share the budget. What the operator just did (claiming a number,
 * logging a call, saving a disposition: every non-GET API request, see
 * runAsLive) may use all of it. Everything else (list loads and the refresh
 * after each save) stops RESERVED_FOR_CALLS short, so a burst of refreshes can
 * never leave the next dial waiting half a minute for a slot.
 */
const WINDOW_MS = 60_000;
const BUDGET = Math.max(1, Number(process.env.TWENTY_REQUESTS_PER_MINUTE) || 90);
const RESERVED_FOR_CALLS = Math.min(BUDGET - 1, Math.max(0, Number(process.env.TWENTY_RESERVED_FOR_CALLS) || Math.floor(BUDGET / 3)));
const RETRIES = 4;

type Lane = "live" | "background";
const LIMIT: Record<Lane, number> = { live: BUDGET, background: BUDGET - RESERVED_FOR_CALLS };

const lane = new AsyncLocalStorage<Lane>();

/** Runs `fn` (and everything it awaits) in the live lane: Twenty requests it makes may use the reserved slots. */
export function runAsLive<T>(fn: () => T): T {
  return lane.run("live", fn);
}

/**
 * How long until one more request fits under `limit` in the window, given the
 * send times (oldest first) still inside it; 0 when it fits now. Pure.
 */
export function waitForSlot(sentTimes: number[], now: number, limit: number, windowMs = WINDOW_MS): number {
  if (sentTimes.length < limit) return 0;
  // The request that must age out of the window before this one fits.
  const blocking = sentTimes[sentTimes.length - limit];
  return Math.max(1, windowMs - (now - blocking) + 5);
}

const sent: number[] = [];
const gates: Record<Lane, Promise<void>> = { live: Promise.resolve(), background: Promise.resolve() };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Resolves when a request may go out; slots are handed out in order within each lane. */
function slot(which: Lane): Promise<void> {
  const next = gates[which].then(async () => {
    for (;;) {
      const now = Date.now();
      while (sent.length && now - sent[0] >= WINDOW_MS) sent.shift();
      const wait = waitForSlot(sent, now, LIMIT[which]);
      if (wait === 0) {
        sent.push(now);
        return;
      }
      log.info(`Twenty budget used (${LIMIT[which]}/min, ${which}); waiting ${wait}ms`);
      await sleep(wait);
    }
  });
  gates[which] = next.catch(() => {});
  return next;
}

/** A read that is safe to share: GET, or a GraphQL query (not a mutation). */
function shareKey(url: string, init?: RequestInit): string | null {
  const method = (init?.method ?? "GET").toUpperCase();
  if (method === "GET") return `GET ${url}`;
  if (method === "POST" && /\/graphql$/.test(url) && typeof init?.body === "string" && !/^\s*\{?\s*"query"\s*:\s*"\s*mutation/.test(init.body) && !init.body.includes("mutation ")) {
    return `POST ${url} ${init.body}`;
  }
  return null;
}

const inFlight = new Map<string, Promise<Response>>();

async function send(url: string, init?: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    await slot(lane.getStore() ?? "background");
    // Fail fast instead of hanging past proxy read timeouts (a 60s nginx
    // default turns a stalled upstream into a mystery 504). The pacing
    // budget above is unaffected: a timed-out slot is simply spent.
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30000) });
    if (res.status !== 429 || attempt >= RETRIES) return res;
    const pause = 2000 * (attempt + 1);
    log.info(`Twenty answered 429; retrying in ${pause}ms (${attempt + 1}/${RETRIES})`);
    await sleep(pause);
  }
}

/** fetch for Twenty: paced, shared for identical reads, retried on 429. */
export async function twentyFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const key = shareKey(url, init);
  if (!key) return send(url, init);
  let pending = inFlight.get(key);
  if (!pending) {
    pending = send(url, init).finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
  }
  return (await pending).clone();
}

/** For tests: how many requests went out in the current window. */
export function requestsInWindow(): number {
  const now = Date.now();
  return sent.filter((t) => now - t < WINDOW_MS).length;
}
