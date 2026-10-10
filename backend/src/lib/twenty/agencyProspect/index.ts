import { createLogger } from "../../logger/index.js";
import { createField, getFieldNames, getObjectId } from "../agencyCall/index.js";

const log = createLogger("prospect-schema");

/**
 * Fields the dialer adds to the existing agencyProspect object. Only ever
 * creates what is missing (never edits or removes), so it is safe to re-run.
 *
 * `notes` holds free-text contact notes. They used to be written into
 * `outboundLabel`, a SELECT that drives the SMS pipeline, which corrupted it
 * (docs/plans/CONTACT_DIALER_HANDOFF.md, bug #3 / section 5.4).
 */
const TEXT_FIELDS: Array<{ name: string; label: string }> = [{ name: "notes", label: "Notes" }];

export async function setupProspectSchema(): Promise<{ fields: Array<{ name: string; isNew: boolean }> }> {
  const objectId = await getObjectId("agencyProspect");
  if (!objectId) throw new Error("agencyProspect object not found");
  const existing = await getFieldNames(objectId);
  const fields: Array<{ name: string; isNew: boolean }> = [];
  for (const f of TEXT_FIELDS) {
    if (existing.has(f.name)) {
      fields.push({ name: f.name, isNew: false });
      continue;
    }
    try {
      await createField(objectId, "TEXT", f.name, f.label);
      fields.push({ name: f.name, isNew: true });
      log.info(`Created field ${f.name} (TEXT) on agencyProspects`);
    } catch (err: any) {
      if (/already exists|already used by another field/i.test(String(err?.message || ""))) fields.push({ name: f.name, isNew: false });
      else throw err;
    }
  }
  return { fields };
}
