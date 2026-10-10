import { createMachine } from "../../pipeline/index.js";
import type { CallResult } from "../types.js";
/**
 * agencyCall.status: the system result of a call. A finished call never goes
 * back to In progress (a late pagehide or webhook must not reopen it); the
 * operator's outcome lives in agencyCall.disposition, not here.
 */
export const callResultMachine = createMachine<CallResult>({
  field: "status",
  initial: "IN_PROGRESS",
  states: {
    IN_PROGRESS: { label: "In progress", description: "The call is live.", tone: "progress", next: ["COMPLETED", "FAILED", "NO_ANSWER", "BUSY"] },
    COMPLETED: { label: "Completed", description: "Connected and ended.", tone: "positive", next: ["NO_ANSWER", "FAILED"] },
    NO_ANSWER: { label: "No answer", description: "Rang out or was cancelled.", tone: "neutral", next: ["COMPLETED", "FAILED"] },
    BUSY: { label: "Busy", description: "The line was busy.", tone: "neutral", next: ["COMPLETED", "NO_ANSWER", "FAILED"] },
    FAILED: { label: "Failed", description: "The call could not be placed.", tone: "negative", next: ["COMPLETED", "NO_ANSWER"] },
  },
});
