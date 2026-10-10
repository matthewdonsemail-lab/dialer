import { createLogger } from "../../logger/index.js";
import { applySchema, SCHEMA_MANIFEST } from "../schema/index.js";

const log = createLogger('twenty-object-service');

/**
 * Twenty reports name collisions several ways depending on version/path
 * ("already exists" vs METADATA_VALIDATION_FAILED/NOT_AVAILABLE "already
 * used by another field"). All mean the same for idempotent setup: the
 * field is there, record isNew:false and continue. Pure string match.
 */
export function isFieldExistsError(err: any): boolean {
  const msg = String(err?.message || "");
  return /already exists|already used by another field/i.test(msg);
}

/**
 * Setup all required Twenty CRM objects and fields: applies the schema
 * manifest (lib/twenty/schema), the single source of truth for the dialer's
 * Twenty shape. Additive; throws when any item failed so the caller sees it.
 */
export async function setupTwentyCRM(): Promise<{
  objects: Array<{ name: string; id: string; isNew: boolean }>;
  fields: Array<{ object: string; name: string; isNew: boolean }>;
}> {
  const report = await applySchema();
  const plural = new Map(SCHEMA_MANIFEST.objects.map((o) => [o.nameSingular, o.namePlural]));

  const failed = report.items.filter((i) => i.status === "failed");
  if (failed.length) {
    const why = failed.map((i) => `${i.object}.${i.name}: ${i.note}`).join("; ");
    log.error(`Setup failed for ${failed.length} item(s): ${why}`);
    throw new Error(`Setup failed for ${failed.length} item(s): ${why}`);
  }

  const objects = report.items
    .filter((i) => i.kind === "object")
    .map((i) => ({ name: i.name, id: report.objectIds[i.object] ?? "", isNew: i.status === "created" }));
  const fields = report.items
    .filter((i) => i.kind !== "object")
    .map((i) => ({ object: plural.get(i.object) ?? i.object, name: i.name, isNew: i.status === "created" }));

  log.info(`Setup completed. ${objects.length} objects, ${fields.length} fields (${report.items.filter((i) => i.status === "created").length} created).`);
  return { objects, fields };
}
