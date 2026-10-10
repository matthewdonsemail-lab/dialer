import { createLogger } from "../../logger/index.js";
import { loadSyncConfig } from "../client/index.js";
import { SCHEMA_MANIFEST } from "./manifest.js";
import type {
  ApplyItem,
  ApplyOptions,
  ApplyReport,
  MetadataRequest,
  SchemaField,
  SchemaManifest,
  SchemaRelation,
} from "./types.js";

const log = createLogger("twenty-schema");

/** Live field / object as the snapshot query returns them. */
interface LiveField {
  type: string;
  isActive: boolean;
  options: Array<{ value: string }> | null;
}

interface LiveObject {
  id: string;
  nameSingular: string;
  namePlural: string;
  fields: Map<string, LiveField>;
}

const SNAPSHOT_QUERY = `{ objects(paging: { first: 1000 }) { edges { node { id nameSingular namePlural
  fields(paging: { first: 1000 }) { edges { node { name type isActive options } } } } } } }`;

const CREATE_OBJECT = `mutation CreateObject($input: CreateOneObjectInput!) {
  createOneObject(input: $input) { id nameSingular } }`;

const CREATE_FIELD = `mutation CreateField($input: CreateOneFieldMetadataInput!) {
  createOneField(input: $input) { id name } }`;

/** Twenty's metadata endpoint, authenticated with the server API key. */
export const metadataRequest: MetadataRequest = async <T>(query: string, variables?: Record<string, unknown>) => {
  const cfg = loadSyncConfig();
  const response = await fetch(`${cfg.twentyBaseUrl}/metadata`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.twentyApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Metadata error ${response.status}: ${text.slice(0, 300)}`);
  }
  const json = await response.json();
  if (json.errors?.length > 0) {
    throw new Error(json.errors.map((e: { message?: string }) => e.message).join("; ").slice(0, 500));
  }
  return json.data as T;
};

/** Read-only: every object in the workspace with its field names and types. */
export async function readLiveSchema(request: MetadataRequest = metadataRequest): Promise<Map<string, LiveObject>> {
  const data = await request<any>(SNAPSHOT_QUERY);
  const out = new Map<string, LiveObject>();
  for (const { node } of data.objects.edges) {
    const fields = new Map<string, LiveField>();
    for (const { node: f } of node.fields.edges) {
      fields.set(f.name, { type: f.type, isActive: f.isActive !== false, options: Array.isArray(f.options) ? f.options : null });
    }
    out.set(node.nameSingular, { id: node.id, nameSingular: node.nameSingular, namePlural: node.namePlural, fields });
  }
  return out;
}

/** Same rule as objectService.isFieldExistsError: a name collision means it is there. */
function isExistsError(err: unknown): boolean {
  return /already exists|already used by another field/i.test(String((err as Error)?.message || ""));
}

/** Drift on a field that exists: different type, inactive, or SELECT values it lacks. */
function driftNote(want: { type: string; options?: Array<{ value: string }> }, live: LiveField): string | undefined {
  const notes: string[] = [];
  if (live.type !== want.type) notes.push(`type is ${live.type}, manifest says ${want.type}`);
  if (!live.isActive) notes.push("field is inactive");
  if (want.options && live.options) {
    const have = new Set(live.options.map((o) => o.value));
    const lacking = want.options.filter((o) => !have.has(o.value)).map((o) => o.value);
    if (lacking.length) notes.push(`missing options ${lacking.join(", ")}`);
  }
  return notes.length ? notes.join("; ") : undefined;
}

/** createOneField input for a plain field. Non-nullable TEXT gets '' as its default. */
function fieldInput(objectMetadataId: string, f: SchemaField): Record<string, unknown> {
  const isNullable = f.isNullable ?? true;
  const defaultValue = f.defaultValue ?? (!isNullable && f.type === "TEXT" ? "''" : undefined);
  return {
    objectMetadataId,
    type: f.type,
    name: f.name,
    label: f.label,
    description: f.description ?? "",
    ...(f.icon ? { icon: f.icon } : {}),
    isNullable,
    isLabelSyncedWithName: false,
    ...(defaultValue !== undefined ? { defaultValue } : {}),
    ...(f.settings ? { settings: f.settings } : {}),
    ...(f.options ? { options: f.options.map((o, position) => ({ ...o, position })) } : {}),
  };
}

function relationInput(objectMetadataId: string, targetObjectMetadataId: string, r: SchemaRelation): Record<string, unknown> {
  return {
    objectMetadataId,
    type: "RELATION",
    name: r.name,
    label: r.label,
    description: "",
    icon: r.icon,
    isNullable: true,
    isLabelSyncedWithName: false,
    settings: { relationType: "MANY_TO_ONE", onDelete: r.onDelete, joinColumnName: `${r.name}Id` },
    relationCreationPayload: {
      targetObjectMetadataId,
      targetFieldLabel: r.targetFieldLabel,
      targetFieldIcon: r.targetFieldIcon,
      type: "MANY_TO_ONE",
    },
  };
}

/**
 * Bring a Twenty workspace up to the manifest. Idempotent and additive: it
 * only creates what is missing (objects, then plain fields, then relations)
 * and never edits or deletes. A present field whose type or options differ is
 * reported with a note, not changed. With dryRun it only reads metadata and
 * reports what would be created as "missing".
 */
export async function applySchema(options: ApplyOptions = {}): Promise<ApplyReport> {
  const manifest: SchemaManifest = options.manifest ?? SCHEMA_MANIFEST;
  const request = options.request ?? metadataRequest;
  const dryRun = options.dryRun ?? false;
  const items: ApplyItem[] = [];
  const push = (item: ApplyItem) => {
    items.push(item);
    options.onItem?.(item);
  };

  let live = await readLiveSchema(request);

  // 1. Objects.
  let createdObject = false;
  for (const o of manifest.objects) {
    if (live.has(o.nameSingular)) {
      push({ kind: "object", object: o.nameSingular, name: o.namePlural, status: "present" });
      continue;
    }
    if (dryRun) {
      push({ kind: "object", object: o.nameSingular, name: o.namePlural, status: "missing" });
      continue;
    }
    try {
      await request(CREATE_OBJECT, {
        input: {
          object: {
            nameSingular: o.nameSingular,
            namePlural: o.namePlural,
            labelSingular: o.labelSingular,
            labelPlural: o.labelPlural,
            description: o.description,
            icon: o.icon,
            isLabelSyncedWithName: false,
          },
        },
      });
      createdObject = true;
      log.info(`Created object ${o.nameSingular}`);
      push({ kind: "object", object: o.nameSingular, name: o.namePlural, status: "created" });
    } catch (err) {
      push({ kind: "object", object: o.nameSingular, name: o.namePlural, status: "failed", note: (err as Error).message });
    }
  }
  // New objects come with standard fields; re-read so they count as present.
  if (createdObject) live = await readLiveSchema(request);

  // 2. Plain fields.
  for (const o of manifest.objects) {
    const obj = live.get(o.nameSingular);
    for (const f of o.fields) {
      const item = { kind: "field" as const, object: o.nameSingular, name: f.name };
      const existing = obj?.fields.get(f.name);
      if (existing) {
        push({ ...item, status: "present", note: driftNote(f, existing) });
        continue;
      }
      if (dryRun || !obj) {
        push({ ...item, status: dryRun ? "missing" : "failed", note: dryRun ? undefined : `object ${o.nameSingular} does not exist` });
        continue;
      }
      try {
        await request(CREATE_FIELD, { input: { field: fieldInput(obj.id, f) } });
        log.info(`Created field ${o.nameSingular}.${f.name} (${f.type})`);
        push({ ...item, status: "created" });
      } catch (err) {
        if (isExistsError(err)) push({ ...item, status: "present" });
        else push({ ...item, status: "failed", note: (err as Error).message });
      }
    }
  }

  // 3. Relations, once both ends exist.
  for (const r of manifest.relations) {
    const item = { kind: "relation" as const, object: r.object, name: r.name };
    const source = live.get(r.object);
    const target = live.get(r.target);
    const existing = source?.fields.get(r.name);
    if (existing) {
      push({ ...item, status: "present", note: driftNote({ type: "RELATION" }, existing) });
      continue;
    }
    if (dryRun) {
      push({ ...item, status: "missing", note: `-> ${r.target}.${r.targetFieldName}` });
      continue;
    }
    if (!source || !target) {
      push({ ...item, status: "failed", note: `object ${!source ? r.object : r.target} does not exist` });
      continue;
    }
    if (target.fields.has(r.targetFieldName)) {
      push({ ...item, status: "failed", note: `${r.target}.${r.targetFieldName} already exists without this relation` });
      continue;
    }
    try {
      await request(CREATE_FIELD, { input: { field: relationInput(source.id, target.id, r) } });
      log.info(`Created relation ${r.object}.${r.name} -> ${r.target}.${r.targetFieldName}`);
      push({ ...item, status: "created" });
    } catch (err) {
      if (isExistsError(err)) push({ ...item, status: "present" });
      else push({ ...item, status: "failed", note: (err as Error).message });
    }
  }

  const objectIds: Record<string, string> = {};
  for (const o of manifest.objects) {
    const found = live.get(o.nameSingular);
    if (found) objectIds[o.nameSingular] = found.id;
  }
  return { dryRun, items, objectIds };
}
