import { createLogger } from "../../logger/index.js";
import { loadSyncConfig } from "../client/index.js";
import { setupCallHistorySchema } from "./helpers/call-history-setup.js";

const log = createLogger('twenty-object-service');

/**
 * Execute a GraphQL mutation against Twenty's metadata API
 */
async function graphqlMutation<T = any>(mutation: string): Promise<T> {
  const cfg = loadSyncConfig();
  const url = `${cfg.twentyBaseUrl}/metadata`;

  log.info(`GraphQL mutation to ${url}`);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.twentyApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: mutation }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GraphQL error ${response.status}: ${text}`);
  }

  const json = await response.json();

  if (json.errors?.length > 0) {
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  }

  return json.data;
}

/**
 * Get object metadata by name
 */
export async function getObjectByName(objectName: string): Promise<any> {
  const query = `
    query {
      objects(paging: { first: 100 }) {
        edges {
          node {
            id
            nameSingular
            namePlural
          }
        }
      }
    }
  `;

  const data = await graphqlMutation<{ objects: { edges: { node: any }[] } }>(query);
  return data.objects.edges.find((e: { node: any }) =>
    e.node.nameSingular === objectName || e.node.namePlural === objectName
  )?.node;
}

/**
 * Create a custom object in Twenty CRM
 */
export async function createObject(params: {
  nameSingular: string;
  namePlural: string;
  labelSingular?: string;
  labelPlural?: string;
  description?: string;
  icon?: string;
}): Promise<{ id: string }> {
  const mutation = `
    mutation {
      createOneObject(input: {
        object: {
          nameSingular: "${params.nameSingular}"
          namePlural: "${params.namePlural}"
          labelSingular: "${params.labelSingular || params.nameSingular}"
          labelPlural: "${params.labelPlural || params.namePlural}"
          description: "${params.description || ''}"
          icon: "${params.icon || 'IconBuildingSkyscraper'}"
          isLabelSyncedWithName: false
        }
      }) {
        id
        nameSingular
        namePlural
      }
    }
  `;

  const result = await graphqlMutation(mutation);
  const createdObj = result.createOneObject || result.object;
  log.info(`Created object: ${createdObj?.nameSingular}`);
  return { id: createdObj?.id };
}

/**
 * Create a SELECT field with options
 */
export async function createSelectField(params: {
  objectMetadataId: string;
  name: string;
  label: string;
  description?: string;
  options: Array<{ label: string; value: string; color: string }>;
}): Promise<{ id: string }> {
  const optionsGql = `[${params.options.map((o, idx) => `{ label: "${o.label}", value: "${o.value}", color: "${o.color}", position: ${idx} }`).join(', ')}]`;

  const mutation = `
    mutation {
      createOneField(input: {
        field: {
          objectMetadataId: "${params.objectMetadataId}"
          type: SELECT
          name: "${params.name}"
          label: "${params.label}"
          description: "${params.description || ''}"
          isNullable: true
          options: ${optionsGql}
        }
      }) {
        id
        name
      }
    }
  `;

  const result = await graphqlMutation(mutation);
  const createdField = result.createOneField || result.field;
  log.info(`Created field ${params.name} on object ${params.objectMetadataId}`);
  return { id: createdField?.id };
}

/**
 * Create a TEXT field
 */
export async function createTextField(params: {
  objectMetadataId: string;
  name: string;
  label: string;
  description?: string;
}): Promise<{ id: string }> {
  const mutation = `
    mutation {
      createOneField(input: {
        field: {
          objectMetadataId: "${params.objectMetadataId}"
          type: TEXT
          name: "${params.name}"
          label: "${params.label}"
          description: "${params.description || ''}"
          isNullable: true
        }
      }) {
        id
        name
      }
    }
  `;

  const result = await graphqlMutation(mutation);
  const createdField = result.createOneField || result.field;
  log.info(`Created field ${params.name} on object ${params.objectMetadataId}`);
  return { id: createdField?.id };
}

/**
 * Create a DATE_TIME field
 */
export async function createDateTimeField(params: {
  objectMetadataId: string;
  name: string;
  label: string;
  description?: string;
}): Promise<{ id: string }> {
  const mutation = `
    mutation {
      createOneField(input: {
        field: {
          objectMetadataId: "${params.objectMetadataId}"
          type: DATE_TIME
          name: "${params.name}"
          label: "${params.label}"
          description: "${params.description || ''}"
          isNullable: true
        }
      }) {
        id
        name
      }
    }
  `;

  const result = await graphqlMutation(mutation);
  const createdField = result.createOneField || result.field;
  log.info(`Created date_time field ${params.name} on object ${params.objectMetadataId}`);
  return { id: createdField?.id };
}

/**
 * Create a RELATION field
 */
export async function createRelationField(params: {
  objectMetadataId: string;
  name: string;
  label: string;
  description?: string;
  relatedObjectMetadataId: string;
}): Promise<{ id: string }> {
  const mutation = `
    mutation {
      createOneField(input: {
        field: {
          objectMetadataId: "${params.objectMetadataId}"
          type: RELATION
          name: "${params.name}"
          label: "${params.label}"
          description: "${params.description || ''}"
          isNullable: true
          settings: {
            relationType: "MANY_TO_ONE"
            onDelete: "SET_NULL"
            joinColumnName: "${params.name}"
          }
          relationCreationPayload: {
            targetObjectMetadataId: "${params.relatedObjectMetadataId}"
            targetFieldLabel: "Scripts"
            targetFieldIcon: "IconFileText"
            type: "MANY_TO_ONE"
          }
        }
      }) {
        id
        name
      }
    }
  `;

  const result = await graphqlMutation(mutation);
  const createdField = result.createOneField || result.field;
  log.info(`Created relation field ${params.name} on object ${params.objectMetadataId}`);
  return { id: createdField?.id };
}

/**
 * Check if object exists and get its ID
 */
export async function getOrCreateObject(params: {
  nameSingular: string;
  namePlural: string;
  labelSingular?: string;
  labelPlural?: string;
  description?: string;
  icon?: string;
}): Promise<{ id: string; isNew: boolean }> {
  const existing = await getObjectByName(params.nameSingular);

  if (existing) {
    log.info(`Object ${params.nameSingular} already exists with id: ${existing.id}`);
    return { id: existing.id, isNew: false };
  }

  const result = await createObject(params);
  return { id: result.id, isNew: true };
}

/**
 * Setup all required Twenty CRM objects and fields
 */
export async function setupTwentyCRM(): Promise<{
  objects: Array<{ name: string; id: string; isNew: boolean }>;
  fields: Array<{ object: string; name: string; isNew: boolean }>;
}> {
  const results = {
    objects: [] as Array<{ name: string; id: string; isNew: boolean }>,
    fields: [] as Array<{ object: string; name: string; isNew: boolean }>,
  };

  try {
    // 1. Create agencyProspects object
    const prospectsObj = await getOrCreateObject({
      nameSingular: "agencyProspect",
      namePlural: "agencyProspects",
      labelSingular: "Prospect",
      labelPlural: "Prospects",
      description: "Cold call prospects",
      icon: "IconBuildingSkyscraper",
    });
    results.objects.push({ name: "agencyProspects", id: prospectsObj.id, isNew: prospectsObj.isNew });

    // 2. Create agencyLeads object
    const leadsObj = await getOrCreateObject({
      nameSingular: "agencyLead",
      namePlural: "agencyLeads",
      labelSingular: "Lead",
      labelPlural: "Leads",
      description: "Converted leads from prospects",
      icon: "IconUser",
    });
    results.objects.push({ name: "agencyLeads", id: leadsObj.id, isNew: leadsObj.isNew });

    // 3. Create agencyCampaigns object
    const campaignsObj = await getOrCreateObject({
      nameSingular: "agencyCampaign",
      namePlural: "agencyCampaigns",
      labelSingular: "Campaign",
      labelPlural: "Campaigns",
      description: "Calling campaigns",
      icon: "IconPhone",
    });
    results.objects.push({ name: "agencyCampaigns", id: campaignsObj.id, isNew: campaignsObj.isNew });

    // 4. Create agencyScripts object
    const scriptsObj = await getOrCreateObject({
      nameSingular: "agencyScript",
      namePlural: "agencyScripts",
      labelSingular: "Script",
      labelPlural: "Scripts",
      description: "Call scripts for campaigns",
      icon: "IconFileText",
    });
    results.objects.push({ name: "agencyScripts", id: scriptsObj.id, isNew: scriptsObj.isNew });

    // 4a. Create campaignId relation field on agencyScripts
    try {
      await createRelationField({
        objectMetadataId: scriptsObj.id,
        name: "campaignId",
        label: "Campaign",
        description: "Link to agency campaign",
        relatedObjectMetadataId: campaignsObj.id,
      });
      results.fields.push({ object: "agencyScripts", name: "campaignId", isNew: true });
    } catch (err: any) {
      if (err.message?.includes("already exists")) {
        results.fields.push({ object: "agencyScripts", name: "campaignId", isNew: false });
      } else {
        throw err;
      }
    }

    // 5. Create agencyPhones object
    const phonesObj = await getOrCreateObject({
      nameSingular: "agencyPhone",
      namePlural: "agencyPhones",
      labelSingular: "Agency Phone",
      labelPlural: "Agency Phones",
      description: "Agency pool phone numbers",
      icon: "IconPhoneCall",
    });
    results.objects.push({ name: "agencyPhones", id: phonesObj.id, isNew: phonesObj.isNew });

    // 5a. Create custom fields for agencyPhones
    const phoneTextFields = [
      { name: "phoneNumber", label: "Phone Number" },
      { name: "claimedByMemberId", label: "Claimed By Member ID" },
      { name: "claimedByEmail", label: "Claimed By Email" },
      { name: "currentCallId", label: "Current Call ID" },
    ];
    for (const f of phoneTextFields) {
      try {
        await createTextField({ objectMetadataId: phonesObj.id, name: f.name, label: f.label });
        results.fields.push({ object: "agencyPhones", name: f.name, isNew: true });
      } catch (err: any) {
        if (err.message?.includes("already exists")) {
          results.fields.push({ object: "agencyPhones", name: f.name, isNew: false });
        } else {
          throw err;
        }
      }
    }

    const phoneDateTimeFields = [
      { name: "claimedAt", label: "Claimed At" },
      { name: "lastHeartbeatAt", label: "Last Heartbeat At" },
    ];
    for (const f of phoneDateTimeFields) {
      try {
        await createDateTimeField({ objectMetadataId: phonesObj.id, name: f.name, label: f.label });
        results.fields.push({ object: "agencyPhones", name: f.name, isNew: true });
      } catch (err: any) {
        if (err.message?.includes("already exists")) {
          results.fields.push({ object: "agencyPhones", name: f.name, isNew: false });
        } else {
          throw err;
        }
      }
    }

    try {
      await createSelectField({
        objectMetadataId: phonesObj.id,
        name: "callState",
        label: "Call State",
        options: [
          { label: "Idle", value: "IDLE", color: "gray" },
          { label: "Dialing", value: "DIALING", color: "amber" },
          { label: "Active", value: "ACTIVE", color: "green" },
        ],
      });
      results.fields.push({ object: "agencyPhones", name: "callState", isNew: true });
    } catch (err: any) {
      if (err.message?.includes("already exists")) {
        results.fields.push({ object: "agencyPhones", name: "callState", isNew: false });
      } else {
        throw err;
      }
    }

    // 6. Create SELECT fields for agencyProspects
    const prospectFields = [
      {
        name: "coldCallStatus",
        label: "Cold Call Status",
        options: [
          { label: "New", value: "NEW", color: "blue" },
          { label: "Contacted", value: "CONTACTED", color: "green" },
          { label: "Interested", value: "INTERESTED", color: "green" },
          { label: "Not Interested", value: "NOT_INTERESTED", color: "red" },
          { label: "Callback", value: "CALLBACK", color: "amber" },
          { label: "Converted", value: "CONVERTED", color: "purple" },
          { label: "Do Not Contact", value: "DO_NOT_CONTACT", color: "gray" },
        ],
      },
      {
        name: "utmSource",
        label: "UTM Source",
        options: [
          { label: "Outbound", value: "OUTBOUND", color: "blue" },
          { label: "Inbound", value: "INBOUND", color: "green" },
          { label: "Blended", value: "BLENDED", color: "purple" },
        ],
      },
    ];

    for (const field of prospectFields) {
      try {
        await createSelectField({
          objectMetadataId: prospectsObj.id,
          name: field.name,
          label: field.label,
          options: field.options,
        });
        results.fields.push({ object: "agencyProspects", name: field.name, isNew: true });
      } catch (err: any) {
        // Field may already exist
        if (err.message?.includes("already exists")) {
          results.fields.push({ object: "agencyProspects", name: field.name, isNew: false });
        } else {
          throw err;
        }
      }
    }

    // 6. Create SELECT fields for agencyCampaigns
    const campaignFields = [
      {
        name: "status",
        label: "Status",
        options: [
          { label: "Active", value: "ACTIVE", color: "green" },
          { label: "Inactive", value: "INACTIVE", color: "gray" },
          { label: "Draft", value: "DRAFT", color: "amber" },
        ],
      },
      {
        name: "campaignType",
        label: "Campaign Type",
        options: [
          { label: "Outbound", value: "OUTBOUND", color: "blue" },
          { label: "Inbound", value: "INBOUND", color: "green" },
          { label: "Blended", value: "BLENDED", color: "purple" },
          { label: "Referral", value: "REFERRAL", color: "amber" },
          { label: "Cold Call", value: "COLD_CALL", color: "red" },
          { label: "Website", value: "WEBSITE", color: "cyan" },
          { label: "Twenty Import", value: "TWENTY_IMPORT", color: "gray" },
          { label: "Other", value: "OTHER", color: "gray" },
        ],
      },
    ];

    for (const field of campaignFields) {
      try {
        await createSelectField({
          objectMetadataId: campaignsObj.id,
          name: field.name,
          label: field.label,
          options: field.options,
        });
        results.fields.push({ object: "agencyCampaigns", name: field.name, isNew: true });
      } catch (err: any) {
        if (err.message?.includes("already exists")) {
          results.fields.push({ object: "agencyCampaigns", name: field.name, isNew: false });
        } else {
          throw err;
        }
      }
    }

    // 7. Create agencyCalls object + call-history fields (call log persistence)
    const callsSchema = await setupCallHistorySchema();
    results.objects.push({ name: "agencyCalls", id: callsSchema.objectId, isNew: callsSchema.objectIsNew });
    for (const f of callsSchema.fields) {
      results.fields.push({ object: "agencyCalls", name: f.name, isNew: f.isNew });
    }

    log.info(`Setup completed. Created ${results.objects.length} objects and ${results.fields.length} fields.`);
  } catch (err: any) {
    log.error(`Setup failed: ${err.message}`);
    throw err;
  }

  return results;
}
