import { twentyGraphQL } from "./twenty.js";

// Port of the dialer's twenty-object-service: creates the agency* custom
// objects + SELECT/RELATION fields via Twenty's /graphql metadata endpoint.
// Idempotent-ish: existing objects/fields are reported with isNew:false.

async function mutation<T = any>(gql: string): Promise<T> {
  return twentyGraphQL<T>(gql);
}

async function getObjectByName(objectName: string): Promise<any> {
  const data = await mutation<{ objects: { edges: { node: any }[] } }>(`
    query { objects(paging: { first: 100 }) { edges { node { id nameSingular namePlural } } } }`);
  return data.objects.edges.find((e) => e.node.nameSingular === objectName || e.node.namePlural === objectName)?.node;
}

async function createObject(params: { nameSingular: string; namePlural: string; labelSingular?: string; labelPlural?: string; description?: string; icon?: string }): Promise<{ id: string }> {
  const result = await mutation<any>(`
    mutation {
      createOneObject(input: { object: {
        nameSingular: "${params.nameSingular}"
        namePlural: "${params.namePlural}"
        labelSingular: "${params.labelSingular || params.nameSingular}"
        labelPlural: "${params.labelPlural || params.namePlural}"
        description: "${params.description || ""}"
        icon: "${params.icon || "IconBuildingSkyscraper"}"
        isLabelSyncedWithName: false
      } }) { id nameSingular namePlural }
    }`);
  return { id: result.object.id };
}

async function createSelectField(params: { objectMetadataId: string; name: string; label: string; options: Array<{ label: string; value: string; color: string }> }): Promise<{ id: string }> {
  const optionsJson = JSON.stringify(params.options).replace(/"/g, '\\"');
  const result = await mutation<any>(`
    mutation {
      createOneField(input: { field: {
        objectMetadataId: "${params.objectMetadataId}"
        type: SELECT
        name: "${params.name}"
        label: "${params.label}"
        isNullable: true
        options: ${optionsJson}
      } }) { id name }
    }`);
  return { id: result.field.id };
}

async function createRelationField(params: { objectMetadataId: string; name: string; label: string; relatedObjectMetadataId: string }): Promise<{ id: string }> {
  const result = await mutation<any>(`
    mutation {
      createOneField(input: { field: {
        objectMetadataId: "${params.objectMetadataId}"
        type: RELATION
        name: "${params.name}"
        label: "${params.label}"
        isNullable: true
        settings: { relationType: "MANY_TO_ONE" onDelete: "SET_NULL" joinColumnName: "${params.name}" }
        relationCreationPayload: {
          targetObjectMetadataId: "${params.relatedObjectMetadataId}"
          targetFieldLabel: "Name"
          targetFieldIcon: "IconBuildingSkyscraper"
          type: "MANY_TO_ONE"
        }
      } }) { id name }
    }`);
  return { id: result.createOneField.id };
}

async function getOrCreateObject(params: { nameSingular: string; namePlural: string; labelSingular?: string; labelPlural?: string; description?: string; icon?: string }): Promise<{ id: string; isNew: boolean }> {
  const existing = await getObjectByName(params.nameSingular);
  if (existing) return { id: existing.id, isNew: false };
  const result = await createObject(params);
  return { id: result.id, isNew: true };
}

export async function setupTwentyCRM(): Promise<{
  objects: Array<{ name: string; id: string; isNew: boolean }>;
  fields: Array<{ object: string; name: string; isNew: boolean }>;
}> {
  const results = {
    objects: [] as Array<{ name: string; id: string; isNew: boolean }>,
    fields: [] as Array<{ object: string; name: string; isNew: boolean }>,
  };

  const prospectsObj = await getOrCreateObject({ nameSingular: "agencyProspect", namePlural: "agencyProspects", labelSingular: "Prospect", labelPlural: "Prospects", description: "Cold call prospects", icon: "IconBuildingSkyscraper" });
  results.objects.push({ name: "agencyProspects", id: prospectsObj.id, isNew: prospectsObj.isNew });

  const leadsObj = await getOrCreateObject({ nameSingular: "agencyLead", namePlural: "agencyLeads", labelSingular: "Lead", labelPlural: "Leads", description: "Converted leads from prospects", icon: "IconUser" });
  results.objects.push({ name: "agencyLeads", id: leadsObj.id, isNew: leadsObj.isNew });

  const campaignsObj = await getOrCreateObject({ nameSingular: "agencyCampaign", namePlural: "agencyCampaigns", labelSingular: "Campaign", labelPlural: "Campaigns", description: "Calling campaigns", icon: "IconPhone" });
  results.objects.push({ name: "agencyCampaigns", id: campaignsObj.id, isNew: campaignsObj.isNew });

  const scriptsObj = await getOrCreateObject({ nameSingular: "agencyScript", namePlural: "agencyScripts", labelSingular: "Script", labelPlural: "Scripts", description: "Call scripts for campaigns", icon: "IconFileText" });
  results.objects.push({ name: "agencyScripts", id: scriptsObj.id, isNew: scriptsObj.isNew });

  try {
    await createRelationField({ objectMetadataId: scriptsObj.id, name: "campaignId", label: "Campaign", relatedObjectMetadataId: campaignsObj.id });
    results.fields.push({ object: "agencyScripts", name: "campaignId", isNew: true });
  } catch (err: any) {
    if (err.message?.includes("already exists")) results.fields.push({ object: "agencyScripts", name: "campaignId", isNew: false });
    else throw err;
  }

  const prospectFields = [
    { name: "coldCallStatus", label: "Cold Call Status", options: [
      { label: "New", value: "NEW", color: "blue" },
      { label: "Contacted", value: "CONTACTED", color: "emerald" },
      { label: "Interested", value: "INTERESTED", color: "green" },
      { label: "Not Interested", value: "NOT_INTERESTED", color: "red" },
      { label: "Callback", value: "CALLBACK", color: "amber" },
      { label: "Converted", value: "CONVERTED", color: "purple" },
      { label: "Do Not Contact", value: "DO_NOT_CONTACT", color: "gray" } ] },
    { name: "utmSource", label: "UTM Source", options: [
      { label: "Outbound", value: "OUTBOUND", color: "blue" },
      { label: "Inbound", value: "INBOUND", color: "emerald" },
      { label: "Blended", value: "BLENDED", color: "purple" } ] },
  ];
  for (const field of prospectFields) {
    try {
      await createSelectField({ objectMetadataId: prospectsObj.id, name: field.name, label: field.label, options: field.options });
      results.fields.push({ object: "agencyProspects", name: field.name, isNew: true });
    } catch (err: any) {
      if (err.message?.includes("already exists")) results.fields.push({ object: "agencyProspects", name: field.name, isNew: false });
      else throw err;
    }
  }

  const campaignFields = [
    { name: "status", label: "Status", options: [
      { label: "Active", value: "ACTIVE", color: "green" },
      { label: "Inactive", value: "INACTIVE", color: "gray" },
      { label: "Draft", value: "DRAFT", color: "amber" } ] },
    { name: "campaignType", label: "Campaign Type", options: [
      { label: "Outbound", value: "OUTBOUND", color: "blue" },
      { label: "Inbound", value: "INBOUND", color: "emerald" },
      { label: "Blended", value: "BLENDED", color: "purple" },
      { label: "Referral", value: "REFERRAL", color: "amber" },
      { label: "Cold Call", value: "COLD_CALL", color: "rose" },
      { label: "Website", value: "WEBSITE", color: "cyan" },
      { label: "Twenty Import", value: "TWENTY_IMPORT", color: "slate" },
      { label: "Other", value: "OTHER", color: "gray" } ] },
  ];
  for (const field of campaignFields) {
    try {
      await createSelectField({ objectMetadataId: campaignsObj.id, name: field.name, label: field.label, options: field.options });
      results.fields.push({ object: "agencyCampaigns", name: field.name, isNew: true });
    } catch (err: any) {
      if (err.message?.includes("already exists")) results.fields.push({ object: "agencyCampaigns", name: field.name, isNew: false });
      else throw err;
    }
  }

  return results;
}
