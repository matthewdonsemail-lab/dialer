import { SCHEMA_MANIFEST } from "../../twenty/schema/index.js";
import { buildDemoRecords, type DemoRecords } from "../records/index.js";

/** Twenty REST writes the seed needs; injected so the plan can be tested without a workspace. */
export interface SeedClient {
  /** PATCH; resolves false when the record does not exist. */
  update: (plural: string, id: string, data: Record<string, unknown>) => Promise<boolean>;
  create: (plural: string, data: Record<string, unknown>) => Promise<void>;
  remove: (plural: string, id: string) => Promise<void>;
}

export interface SeedResult {
  object: string;
  created: number;
  updated: number;
  failed: { id: string; reason: string }[];
}

/** Parents before children, so every relation points at a record that exists. */
const ORDER: (keyof Omit<DemoRecords, "members">)[] = [
  "agencyCampaigns",
  "agencyScripts",
  "agencyPhones",
  "agencyProspects",
  "agencyPeople",
  "agencyLeads",
  "agencyCalls",
  "agencyCallCampaigns",
];

/** The demo key -> the Twenty object's plural name (dial lists are `callCampaigns`). */
const PLURAL: Record<string, string> = { agencyCallCampaigns: "callCampaigns" };

/**
 * The fields a record may send: the manifest's fields, each relation's
 * `<name>Id` foreign key, and Twenty's settable standard fields. Anything
 * else in a demo record (a field a workspace may lack) is dropped. Pure.
 */
export function writableFields(plural: string): Set<string> {
  const object = SCHEMA_MANIFEST.objects.find((o) => o.namePlural === plural);
  const fields = new Set(["id", "name", "createdAt"]);
  if (!object) return fields;
  for (const f of object.fields) fields.add(f.name);
  for (const r of SCHEMA_MANIFEST.relations) if (r.object === object.nameSingular) fields.add(`${r.name}Id`);
  return fields;
}

/** A demo record trimmed to what the object accepts. Pure. */
export function toPayload(plural: string, record: Record<string, unknown>): Record<string, unknown> {
  const allowed = writableFields(plural);
  return Object.fromEntries(Object.entries(record).filter(([k, v]) => allowed.has(k) && v !== undefined));
}

/**
 * Writes the demo workspace: each record is updated when its fixed id exists
 * and created otherwise, so running it twice changes nothing. With `reset`,
 * the demo records are deleted instead (children first).
 */
export async function seedDemo(client: SeedClient, options: { reset?: boolean; now?: Date } = {}): Promise<SeedResult[]> {
  const db = buildDemoRecords(options.now);
  const results: SeedResult[] = [];
  const order = options.reset ? [...ORDER].reverse() : ORDER;
  for (const key of order) {
    const plural = PLURAL[key] ?? key;
    const result: SeedResult = { object: plural, created: 0, updated: 0, failed: [] };
    for (const record of db[key] as Record<string, unknown>[]) {
      const id = String(record.id);
      try {
        if (options.reset) {
          await client.remove(plural, id);
          result.updated++;
          continue;
        }
        const payload = toPayload(plural, record);
        const { id: _id, ...patch } = payload;
        if (await client.update(plural, id, patch)) result.updated++;
        else {
          await client.create(plural, payload);
          result.created++;
        }
      } catch (err) {
        result.failed.push({ id, reason: (err as Error).message.slice(0, 300) });
      }
    }
    results.push(result);
  }
  return results;
}
