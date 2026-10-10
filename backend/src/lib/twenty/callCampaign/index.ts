import { createLogger } from "../../logger/index.js";
import { createField, getFieldNames, getObjectId, metadataMutation } from "../agencyCall/index.js";

const log = createLogger("twenty-call-campaign-setup");

/**
 * Schema for WAVV-style call campaigns: a named dial list made from selected
 * contacts, resumable later. Stored in Twenty so the whole team shares them.
 *
 *   name              campaign name (defaults to the creation date and time)
 *   status            ACTIVE | COMPLETED | ARCHIVED (TEXT, like agencyCalls.status)
 *   contactIds        JSON array of agencyProspect ids, in dial order
 *   createdByMemberId workspaceMember who created it
 *   ownerName         their display name, for the campaign list ("createdByName" is reserved by Twenty)
 *
 * Progress and statistics are not stored: they are derived from agencyCalls
 * made to these contacts after the campaign was created.
 */
const TEXT_FIELDS = ["name", "status", "contactIds", "createdByMemberId", "ownerName"];

function labelFor(name: string): string {
  return name.replace(/Id(s?)$/, " ID$1").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
}

export async function setupCallCampaignSchema(): Promise<{
  objectId: string;
  objectIsNew: boolean;
  fields: Array<{ name: string; isNew: boolean }>;
}> {
  let objectId = await getObjectId("callCampaign");
  let objectIsNew = false;
  if (!objectId) {
    const data = await metadataMutation<any>(`mutation {
      createOneObject(input: { object: {
        nameSingular: "callCampaign"
        namePlural: "callCampaigns"
        labelSingular: "Call Campaign"
        labelPlural: "Call Campaigns"
        description: "Dial lists created from the dialer's Contacts page"
        icon: "IconPhoneOutgoing"
        isLabelSyncedWithName: false
      } }) { id nameSingular namePlural }
    }`);
    objectId = (data.createOneObject || data.object).id as string;
    objectIsNew = true;
    log.info(`Created object callCampaigns (${objectId})`);
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
      log.info(`Created field ${name} on callCampaigns`);
    } catch (err: any) {
      if (/already exists|already used by another field/i.test(String(err?.message || ""))) {
        fields.push({ name, isNew: false });
      } else {
        throw err;
      }
    }
  }
  return { objectId, objectIsNew, fields };
}
