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
 */
const WINDOW_MS = 60_000;
const BUDGET = Math.max(1, Number(process.env.TWENTY_REQUESTS_PER_MINUTE) || 90);
const RETRIES = 4;

const sent: number[] = [];
let gate: Promise<void> = Promise.resolve();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Resolves when a request may go out; slots are handed out in order. */
function slot(): Promise<void> {
  const next = gate.then(async () => {
    for (;;) {
      const now = Date.now();
      while (sent.length && now - sent[0] >= WINDOW_MS) sent.shift();
      if (sent.length < BUDGET) {
        sent.push(now);
        return;
      }
      const wait = WINDOW_MS - (now - sent[0]) + 5;
      log.info(`Twenty budget used (${BUDGET}/min); waiting ${wait}ms`);
      await sleep(wait);
    }
  });
  gate = next.catch(() => {});
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
    await slot();
    const res = await fetch(url, init);
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
