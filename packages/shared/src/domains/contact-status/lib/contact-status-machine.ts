import { createMachine } from "../../pipeline/index.js";
import type { ContactStatus } from "../types.js";

/**
 * agencyProspect.coldCallStatus / agencyLead.coldCallStatus: where a contact
 * is in the calling pipeline. Ordinary changes follow the graph; "Do not
 * contact" is final and can only be reopened (back to New) on purpose.
 */
export const contactStatusMachine = createMachine<ContactStatus>({
  field: "coldCallStatus",
  initial: "NEW",
  states: {
    NEW: {
      label: "New",
      description: "Not called yet.",
      tone: "neutral",
      next: ["CONTACTED", "INTERESTED", "CALLBACK", "NOT_INTERESTED", "DO_NOT_CONTACT"],
    },
    CONTACTED: {
      label: "Contacted",
      description: "Reached at least once, no outcome yet.",
      tone: "info",
      next: ["INTERESTED", "CALLBACK", "NOT_INTERESTED", "CONVERTED", "DO_NOT_CONTACT"],
    },
    INTERESTED: {
      label: "Interested",
      description: "Wants to hear more.",
      tone: "positive",
      next: ["CALLBACK", "CONVERTED", "CONTACTED", "NOT_INTERESTED", "DO_NOT_CONTACT"],
    },
    CALLBACK: {
      label: "Call back",
      description: "Asked to be called again.",
      tone: "progress",
      next: ["CONTACTED", "INTERESTED", "CONVERTED", "NOT_INTERESTED", "DO_NOT_CONTACT"],
    },
    NOT_INTERESTED: {
      label: "Not interested",
      description: "Said no for now. Can be tried again later.",
      tone: "negative",
      next: ["CONTACTED", "INTERESTED", "CALLBACK", "DO_NOT_CONTACT"],
    },
    CONVERTED: {
      label: "Converted",
      description: "Became a customer.",
      tone: "positive",
      next: ["DO_NOT_CONTACT"],
    },
    DO_NOT_CONTACT: {
      label: "Do not contact",
      description: "Asked not to be contacted. No calls or messages.",
      tone: "negative",
      next: [],
      terminal: true,
    },
  },
  overrides: [["DO_NOT_CONTACT", "NEW"]],
});
