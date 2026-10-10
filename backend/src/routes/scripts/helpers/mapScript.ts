import type { AgencyScript, ScriptListItem } from "../types.js";

/** AgencyScript -> frontend list item. Pure. */
export function mapScript(script: AgencyScript): ScriptListItem {
  return {
    id: script.id,
    name: script.name || "Unnamed Script",
    campaignId: script.campaignIdId || null,
    scriptData: script.scriptData ? JSON.parse(script.scriptData) : null,
    created_at: script.createdAt || new Date().toISOString(),
    updated_at: script.updatedAt || new Date().toISOString(),
  };
}
