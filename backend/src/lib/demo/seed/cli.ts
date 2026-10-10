/**
 * Load the demo workspace into Twenty: 3 campaigns, 2 scripts, 4 numbers,
 * 24 prospects, 2 people, 3 leads, 48 calls (one with a full transcript and
 * AI review) and 3 dial lists. Run `bun run twenty:schema` first.
 *
 *   bun run twenty:seed              create or refresh the demo records
 *   bun run twenty:seed -- --reset   delete them again
 *
 * Refuses to write to a workspace that already holds real prospects unless
 * --force is passed, so it cannot mix demo data into a live CRM by accident.
 * Reads TWENTY_BASE_URL / TWENTY_API_KEY from the environment, then from
 * .env.local (repo root, then backend/).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { demoId } from "../records/index.js";
import { seedDemo, type SeedClient } from "./seedDemo.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");

for (const file of [path.join(ROOT, ".env.local"), path.join(ROOT, "backend", ".env.local")]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const base = (process.env.TWENTY_BASE_URL || "").replace(/\/$/, "");
const key = process.env.TWENTY_API_KEY;
if (!base || !key) {
  console.error("TWENTY_BASE_URL and TWENTY_API_KEY must be set (environment or .env.local).");
  process.exit(1);
}
const reset = process.argv.includes("--reset");
const force = process.argv.includes("--force");
const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
const DEMO_PREFIX = demoId(0, 0).slice(0, 24);

async function call(method: string, url: string, body?: unknown): Promise<Response> {
  return fetch(`${base}/rest/${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

async function fail(res: Response, what: string): Promise<never> {
  throw new Error(`${what}: ${res.status} ${(await res.text()).slice(0, 200)}`);
}

const client: SeedClient = {
  async update(plural, id, data) {
    const res = await call("PATCH", `${plural}/${id}`, data);
    if (res.ok) return true;
    // Twenty answers a missing id with 404, or 400 "not found" on some builds.
    const text = await res.text();
    if (res.status === 404 || /not found/i.test(text)) return false;
    throw new Error(`update ${plural}/${id}: ${res.status} ${text.slice(0, 200)}`);
  },
  async create(plural, data) {
    const res = await call("POST", plural, data);
    if (!res.ok) await fail(res, `create ${plural}`);
  },
  async remove(plural, id) {
    const res = await call("DELETE", `${plural}/${id}`);
    if (!res.ok && res.status !== 404) await fail(res, `delete ${plural}/${id}`);
  },
};

if (!reset && !force) {
  const res = await call("GET", "agencyProspects?limit=60");
  if (!res.ok) await fail(res, "Could not read agencyProspects (run `bun run twenty:schema` first?)");
  const body: any = await res.json();
  const rows: { id: string }[] = body?.data?.agencyProspects ?? [];
  const real = rows.filter((r) => !r.id.startsWith(DEMO_PREFIX)).length;
  if (real > 0) {
    console.error(`${base} already has real prospects (${real} or more). The demo data is for a fresh workspace.`);
    console.error("Pass --force to add it anyway; `bun run twenty:seed -- --reset` removes it again.");
    process.exit(1);
  }
}

const results = await seedDemo(client, { reset });
let failed = 0;
for (const r of results) {
  failed += r.failed.length;
  const done = reset ? `${r.updated} removed` : `${r.created} created, ${r.updated} updated`;
  console.log(`  ${r.object.padEnd(20)} ${done}${r.failed.length ? `, ${r.failed.length} failed` : ""}`);
  for (const f of r.failed.slice(0, 3)) console.log(`      ${f.id}: ${f.reason}`);
}
console.log(`\n${reset ? "Removed the demo records from" : "Seeded the demo workspace into"} ${base}${failed ? ` with ${failed} failures` : ""}.`);
process.exit(failed ? 1 : 0);
