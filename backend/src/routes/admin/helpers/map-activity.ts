import type { AdminAction, AdminActivity, AdminObject } from "../types.js";

/** Twenty timelineActivity target column -> dialer object. Other workspace objects are ignored. */
export const TARGET_OBJECTS: Record<string, AdminObject> = {
  targetAgencyCallId: "call",
  targetAgencyProspectId: "prospect",
  targetAgencyLeadId: "lead",
  targetAgencyPhoneId: "phone",
  targetCallCampaignId: "callCampaign",
  targetAgencyCampaignId: "campaign",
  targetAgencyScriptId: "script",
};

/** REST filter keeping only events on dialer objects. */
export const DIALER_TARGET_FILTER = `or(${Object.keys(TARGET_OBJECTS)
  .map((k) => `${k}[is]:NOT_NULL`)
  .join(",")})`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLUMN_FOR: Record<AdminObject, string> = Object.fromEntries(
  Object.entries(TARGET_OBJECTS).map(([column, object]) => [object, column]),
) as Record<AdminObject, string>;

/**
 * Filter for the history of specific records, from "call:<uuid>,prospect:<uuid>".
 * Unknown objects and non-UUID ids are dropped, so nothing user-supplied
 * reaches the Twenty filter unvalidated. Returns null when nothing is valid.
 */
export function recordTargetFilter(targets: string): string | null {
  const parts = targets
    .split(",")
    .map((t) => t.trim().split(":"))
    .filter(([object, id]) => COLUMN_FOR[object as AdminObject] && UUID.test(id ?? ""))
    .slice(0, 10)
    .map(([object, id]) => `${COLUMN_FOR[object as AdminObject]}[eq]:"${id}"`);
  return parts.length ? `or(${parts.join(",")})` : null;
}

const ACTIONS: Record<string, AdminAction> = {
  recordCreated: "created",
  recordUpdated: "updated",
  recordDeleted: "deleted",
  recordRestored: "restored",
  created: "created",
  updated: "updated",
  deleted: "deleted",
  restored: "restored",
};

/** Keep diff values small: long text and nested objects are summarised. */
function shorten(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.length > 80 ? `${value.slice(0, 77)}...` : value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  const json = JSON.stringify(value);
  return json.length > 80 ? `${json.slice(0, 77)}...` : json;
}

export function mapActivity(raw: any, members: Record<string, string>): AdminActivity | null {
  const targetKey = Object.keys(TARGET_OBJECTS).find((k) => raw?.[k]);
  if (!targetKey) return null;
  const snapshot = raw?.timelineActivityTypeSnapshot ?? {};
  const action =
    ACTIONS[snapshot.name] ?? ACTIONS[snapshot.action] ?? ACTIONS[String(raw?.name ?? "").split(".").pop() ?? ""];
  if (!action) return null;

  const memberId: string | null = raw?.workspaceMemberId ?? raw?.createdBy?.workspaceMemberId ?? null;
  const diff = raw?.properties?.diff && typeof raw.properties.diff === "object" ? raw.properties.diff : {};

  return {
    id: String(raw.id),
    happensAt: raw.happensAt ?? raw.createdAt,
    action,
    object: TARGET_OBJECTS[targetKey],
    recordId: raw[targetKey] ?? raw.linkedRecordId ?? null,
    recordName: raw.linkedRecordCachedName || null,
    actor: {
      name: (memberId && members[memberId]) || raw?.createdBy?.name || null,
      memberId,
      source: raw?.createdBy?.source ?? null,
    },
    changes: Object.entries(diff)
      .slice(0, 12)
      .map(([field, v]: [string, any]) => ({ field, before: shorten(v?.before), after: shorten(v?.after) })),
  };
}
