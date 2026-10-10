import { createMachine } from "../../pipeline/index.js";
import type { OfferState } from "../types.js";

/** agencyOffer.status. */
export const offerMachine = createMachine<OfferState>({
  field: "status",
  initial: "DRAFT",
  states: {
    DRAFT: { label: "Draft", description: "Being written; not shown on the offer site.", tone: "neutral", next: ["ACTIVE"] },
    ACTIVE: { label: "Live", description: "Shown on the offer site.", tone: "positive", next: ["PAUSED", "DRAFT"] },
    PAUSED: { label: "Paused", description: "Hidden from the offer site for now.", tone: "warning", next: ["ACTIVE", "DRAFT"] },
  },
});
