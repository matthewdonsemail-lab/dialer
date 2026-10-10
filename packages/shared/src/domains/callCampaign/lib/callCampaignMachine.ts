import { createMachine } from "../../pipeline/index.js";
import type { CallCampaignState } from "../types.js";

/** callCampaign.status. A finished or archived campaign can be reopened. */
export const callCampaignMachine = createMachine<CallCampaignState>({
  field: "status",
  initial: "ACTIVE",
  states: {
    ACTIVE: { label: "Active", description: "Being dialed.", tone: "progress", next: ["COMPLETED", "ARCHIVED"] },
    COMPLETED: { label: "Completed", description: "Every contact has been dialed.", tone: "positive", next: ["ACTIVE", "ARCHIVED"] },
    ARCHIVED: { label: "Archived", description: "Put away; not shown in the dialer.", tone: "neutral", next: ["ACTIVE"] },
  },
});
