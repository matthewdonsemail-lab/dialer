import { createLogger } from "../../logger/index.js";
import { createField, getFieldNames, getObjectId, metadataMutation } from "../agencyCall/index.js";
import { createTwenty, listTwentyAll, updateTwenty } from "../client/index.js";
import type { AudioSession } from "../../audioBridge/index.js";

const log = createLogger("twenty-audio-session");

/**
 * Phone-audio sessions (WAVV "Call me" / "Dial in"): one record per operator
 * phone line, updated by Telnyx webhooks and read by the browser's polls.
 * All TEXT, like agencyCalls.status. "memberId" is the workspaceMember.
 */
const TEXT_FIELDS = [
  "name",
  "mode",
  "status",
  "memberId",
  "agentPhone",
  "agentLegId",
  "pin",
  "contactLegId",
  "contactState",
  "contactAnsweredAt",
  "contactEndedAt",
  "hangupCause",
  "error",
  "expiresAt",
];

function labelFor(name: string): string {
  return name.replace(/Id$/, " ID").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
}

export async function setupAudioSessionSchema() {
  let objectId = await getObjectId("dialerAudioSession");
  let objectIsNew = false;
  if (!objectId) {
    const data = await metadataMutation<any>(`mutation {
      createOneObject(input: { object: {
        nameSingular: "dialerAudioSession"
        namePlural: "dialerAudioSessions"
        labelSingular: "Dialer Audio Session"
        labelPlural: "Dialer Audio Sessions"
        description: "Phone audio lines (Call me / Dial in) used by the dialer"
        icon: "IconHeadset"
        isLabelSyncedWithName: false
      } }) { id }
    }`);
    objectId = (data.createOneObject || data.object).id as string;
    objectIsNew = true;
    log.info(`Created object dialerAudioSessions (${objectId})`);
  }
  const existing = await getFieldNames(objectId);
  const fields: Array<{ name: string; isNew: boolean }> = [];
  for (const name of TEXT_FIELDS) {
    if (existing.has(name)) {
      fields.push({ name, isNew: false });
      continue;
    }
    try {
      await createField(objectId, "TEXT", name, labelFor(name));
      fields.push({ name, isNew: true });
    } catch (err: any) {
      if (/already exists|already used by another field/i.test(String(err?.message || ""))) fields.push({ name, isNew: false });
      else throw err;
    }
  }
  return { objectId, objectIsNew, fields };
}

const PATH = "dialerAudioSessions";

type Row = Record<string, string | null | undefined> & { id: string };

/** Twenty row -> AudioSession, with safe defaults for blank TEXT fields. */
export function toSession(row: Row): AudioSession {
  return {
    id: row.id,
    mode: row.mode === "dial_in" ? "dial_in" : "call_me",
    status: (row.status as AudioSession["status"]) || "failed",
    memberId: row.memberId || "",
    agentPhone: row.agentPhone || null,
    agentLegId: row.agentLegId || null,
    pin: row.pin || null,
    contactLegId: row.contactLegId || null,
    contactState: (row.contactState as AudioSession["contactState"]) || "idle",
    contactAnsweredAt: row.contactAnsweredAt || null,
    contactEndedAt: row.contactEndedAt || null,
    hangupCause: row.hangupCause || null,
    error: row.error || null,
    expiresAt: row.expiresAt || new Date(0).toISOString(),
  };
}

/** Blank strings, not nulls: Twenty TEXT fields store "" for empty. */
function toRow(patch: Partial<AudioSession>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(patch)) if (k !== "id") out[k] = v == null ? "" : String(v);
  return out;
}

export const audioSessionStore = {
  async list(): Promise<AudioSession[]> {
    return (await listTwentyAll<Row>(PATH)).map(toSession);
  },
  async create(data: Partial<AudioSession>): Promise<AudioSession> {
    return toSession(await createTwenty<Row>(PATH, { name: `${data.mode} ${new Date().toISOString().slice(0, 16)}`, ...toRow(data) }));
  },
  async update(id: string, patch: Partial<AudioSession>): Promise<void> {
    await updateTwenty(PATH, id, toRow(patch));
  },
};
