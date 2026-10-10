/** Twenty field types the dialer schema uses (FieldMetadataType). */
export type SchemaFieldType =
  | "TEXT"
  | "NUMBER"
  | "BOOLEAN"
  | "DATE_TIME"
  | "SELECT"
  | "MULTI_SELECT"
  | "PHONES"
  | "EMAILS"
  | "LINKS"
  | "RAW_JSON"
  | "RICH_TEXT";

/** One SELECT / MULTI_SELECT option; position is its index in the list. */
export interface SchemaSelectOption {
  value: string;
  label: string;
  color: string;
}

/** A non-relation field. Omitted flags take Twenty's defaults (nullable, no default). */
export interface SchemaField {
  name: string;
  type: SchemaFieldType;
  label: string;
  description?: string;
  icon?: string;
  isNullable?: boolean;
  /** Twenty's JSON default, e.g. "'VALUE'" for a SELECT (quotes included). */
  defaultValue?: unknown;
  settings?: Record<string, unknown>;
  options?: SchemaSelectOption[];
}

/**
 * A custom object. Twenty adds the standard fields itself (id, name,
 * createdAt, updatedAt, deletedAt, createdBy, updatedBy, position,
 * searchVector, and the timeline/task/note/attachment relations).
 */
export interface SchemaObject {
  nameSingular: string;
  namePlural: string;
  labelSingular: string;
  labelPlural: string;
  description: string;
  icon: string;
  fields: SchemaField[];
}

/**
 * A MANY_TO_ONE relation from `object.name` to `target`. Twenty creates the
 * ONE_TO_MANY inverse on the target, named from targetFieldLabel
 * ("Calls" -> calls), so the label must camelCase to targetFieldName.
 * The REST/GraphQL foreign key is `${name}Id`.
 */
export interface SchemaRelation {
  object: string;
  name: string;
  label: string;
  icon: string;
  target: string;
  targetFieldName: string;
  targetFieldLabel: string;
  targetFieldIcon: string;
  onDelete: "SET_NULL" | "CASCADE" | "RESTRICT" | "NO_ACTION";
}

export interface SchemaManifest {
  objects: SchemaObject[];
  relations: SchemaRelation[];
}

export type ApplyStatus = "created" | "present" | "missing" | "failed";

/** One line of the apply report. `missing` only appears in a dry run. */
export interface ApplyItem {
  kind: "object" | "field" | "relation";
  object: string;
  name: string;
  status: ApplyStatus;
  /** Why it failed, or drift on a present field (type, missing options). */
  note?: string;
}

export interface ApplyReport {
  dryRun: boolean;
  items: ApplyItem[];
  /** Object name -> metadata id, for objects that exist after the run. */
  objectIds: Record<string, string>;
}

/** Sends one metadata GraphQL document; resolves to `data`, throws on errors. */
export type MetadataRequest = <T = unknown>(query: string, variables?: Record<string, unknown>) => Promise<T>;

export interface ApplyOptions {
  dryRun?: boolean;
  manifest?: SchemaManifest;
  request?: MetadataRequest;
  /** Progress line per item, e.g. console.log in the CLI. */
  onItem?: (item: ApplyItem) => void;
}
