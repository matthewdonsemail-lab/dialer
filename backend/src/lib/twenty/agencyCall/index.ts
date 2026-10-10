import { createLogger } from "../../logger/index.js";
import { loadSyncConfig } from "../client/index.js";

const log = createLogger('twenty-call-history-setup');

/**
 * Schema provisioning for call history (agencyCalls).
 *
 * Self-contained on purpose: it uses its own metadata mutations so this
 * feature does not depend on — or rewrite — the generic setup helpers.
 * Field list mirrors exactly what backend/src/routes/calls sends/reads:
 * free-form TEXT for status-like values (e.g. IN_PROGRESS / NO_ANSWER),
 * plain TEXT link ids (agencyPhoneId / agencyProspectId / agencyLeadId),
 * the own-field member attribution id (createdByMemberId),
 * AI analysis fields (aiSummary/aiSentiment/aiScores/aiKeyPoints/aiModel),
 * DATE_TIME for timestamps, NUMBER for durationSeconds and AI numbers.
 */

export async function metadataMutation<T = any>(mutation: string): Promise<T> {
  const cfg = loadSyncConfig();
  const response = await fetch(`${cfg.twentyBaseUrl}/metadata`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.twentyApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: mutation }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Metadata error ${response.status}: ${text.slice(0, 300)}`);
  }
  const json = await response.json();
  if (json.errors?.length > 0) {
    throw new Error(`Metadata errors: ${JSON.stringify(json.errors).slice(0, 300)}`);
  }
  return json.data;
}

export async function getObjectId(nameSingular: string): Promise<string | null> {
  const data = await metadataMutation<any>(
    `{ objects(paging: {first: 100}) { edges { node { id nameSingular } } } }`
  );
  const found = data.objects.edges
    .map((e: any) => e.node)
    .find((n: any) => n.nameSingular === nameSingular);
  return found?.id ?? null;
}

export async function getFieldNames(objectMetadataId: string): Promise<Set<string>> {
  const data = await metadataMutation<any>(
    `{ objects(paging: {first: 100}) { edges { node { id fields(paging: {first: 100}) { edges { node { name } } } } } } }`
  );
  const node = data.objects.edges
    .map((e: any) => e.node)
    .find((n: any) => n.id === objectMetadataId);
  return new Set(
    (node?.fields?.edges ?? []).map((e: any) => e.node.name as string)
  );
}

export async function createField(
  objectMetadataId: string,
  type: "TEXT" | "DATE_TIME" | "NUMBER",
  name: string,
  label: string
): Promise<string> {
  const data = await metadataMutation<any>(`mutation {
    createOneField(input: { field: {
      objectMetadataId: "${objectMetadataId}"
      type: ${type}
      name: "${name}"
      label: "${label}"
      description: ""
      isNullable: true
    } }) { id name }
  }`);
  const created = data.createOneField || data.field;
  return created.id;
}

function labelFor(name: string): string {
  return name
    .replace(/Id$/, " ID")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

const TEXT_FIELDS = [
  "name",
  "direction",
  "status",
  "fromNumber",
  "toNumber",
  "telnyxCallId",
  "telnyxRecordingId",
  "recordingUrl",
  "transcript",
  "transcriptionStatus",
  "summary",
  "debugLog",
  "meetingUrl",
  "meetingProvider",
  "meetingBookingId",
  "meetingStatus",
  "createdByMemberId",
  // AI call analysis (one row = one call; the rating lives on the record).
  // aiSentiment stays TEXT (POSITIVE/NEUTRAL/NEGATIVE/MIXED);
  // aiKeyPoints/aiScores are JSON strings.
  "aiSummary",
  "aiSentiment",
  "aiKeyPoints",
  "aiScores",
  "aiModel",
];

/**
 * Relations are NOT created as TEXT. A Twenty relation is declared under its
 * base name with type RELATION (e.g. `agencyPhone`); REST writes then address
 * it as `agencyPhoneId`. Declaring a TEXT field literally named
 * `agencyPhoneId` would shadow the relation with a useless text column, so
 * these are ensured as relations only, and only when absent.
 */
const RELATION_FIELDS = [
  { name: "agencyPhone", target: "agencyPhone" },
  { name: "agencyProspect", target: "agencyProspect" },
  { name: "agencyLead", target: "agencyLead" },
];

const DATE_TIME_FIELDS = ["startedAt", "endedAt", "meetingAt", "aiAnalyzedAt"];

const NUMBER_FIELDS = ["durationSeconds", "aiScore", "aiConfidence"];

export async function setupCallHistorySchema(): Promise<{
  objectId: string;
  objectIsNew: boolean;
  fields: Array<{ name: string; isNew: boolean }>;
}> {
  let objectId = await getObjectId("agencyCall");
  let objectIsNew = false;
  if (!objectId) {
    const data = await metadataMutation<any>(`mutation {
      createOneObject(input: { object: {
        nameSingular: "agencyCall"
        namePlural: "agencyCalls"
        labelSingular: "Call"
        labelPlural: "Calls"
        description: "Call history records"
        icon: "IconPhoneCall"
        isLabelSyncedWithName: false
      } }) { id nameSingular namePlural }
    }`);
    const created = data.createOneObject || data.object;
    objectId = created.id;
    objectIsNew = true;
    log.info(`Created object agencyCalls (${objectId})`);
  } else {
    log.info(`Object agencyCalls already exists (${objectId})`);
  }
  if (!objectId) {
    throw new Error("Could not resolve agencyCalls object id");
  }

  const existing = await getFieldNames(objectId);
  const fields: Array<{ name: string; isNew: boolean }> = [];
  const ensure = async (type: "TEXT" | "DATE_TIME" | "NUMBER", name: string) => {
    if (existing.has(name)) {
      fields.push({ name, isNew: false });
      return;
    }
    try {
      await createField(objectId, type, name, labelFor(name));
      fields.push({ name, isNew: true });
      log.info(`Created field ${name} (${type}) on agencyCalls`);
    } catch (err: any) {
      if (/already exists|already used by another field/i.test(String(err?.message || ""))) {
        fields.push({ name, isNew: false });
      } else {
        throw err;
      }
    }
  };

  for (const name of TEXT_FIELDS) await ensure("TEXT", name);
  for (const name of DATE_TIME_FIELDS) await ensure("DATE_TIME", name);
  for (const name of NUMBER_FIELDS) await ensure("NUMBER", name);

  // Relations last: they need the target object to exist, and a relation
  // field that already exists (every workspace built before this ran has
  // them) is left exactly as-is.
  for (const rel of RELATION_FIELDS) {
    if (existing.has(rel.name)) {
      fields.push({ name: rel.name, isNew: false });
      continue;
    }
    const targetId = await getObjectId(rel.target);
    if (!targetId) {
      log.info(`Skipping relation ${rel.name}: target object ${rel.target} not found`);
      continue;
    }
    try {
      const data = await metadataMutation<any>(`mutation {
        createOneField(input: { field: {
          objectMetadataId: "${objectId}"
          type: RELATION
          name: "${rel.name}"
          label: ${JSON.stringify(labelFor(rel.name))}
          description: ""
          isNullable: true
          settings: { relationType: "MANY_TO_ONE", onDelete: "SET_NULL", joinColumnName: "${rel.name}Id" }
          relationCreationPayload: {
            targetObjectMetadataId: "${targetId}"
            targetFieldLabel: "Name"
            targetFieldIcon: "IconPhoneCall"
            type: "MANY_TO_ONE"
          }
        } }) { id name }
      }`);
      void data;
      fields.push({ name: rel.name, isNew: true });
      log.info(`Created relation ${rel.name} on agencyCalls -> ${rel.target}`);
    } catch (err: any) {
      if (/already exists|already used by another field/i.test(String(err?.message || ""))) {
        fields.push({ name: rel.name, isNew: false });
      } else {
        throw err;
      }
    }
  }

  return { objectId, objectIsNew, fields };
}
