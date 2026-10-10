import { createMachine } from "../../pipeline/index.js";
import type { VideoState } from "../types.js";
/** agencyProspect.videoStatus: the walkthrough video for one prospect. */
export const videoMachine = createMachine<VideoState>({
  field: "videoStatus",
  initial: "NONE",
  states: {
    NONE: { label: "No video yet", description: "No walkthrough has been requested.", tone: "neutral", next: ["QUEUED"] },
    QUEUED: { label: "Queued", description: "Waiting to be recorded.", tone: "progress", next: ["RECORDING", "FAILED"] },
    RECORDING: { label: "Recording", description: "The walkthrough is being recorded.", tone: "progress", next: ["RENDERED", "FAILED"] },
    RENDERED: { label: "Rendered", description: "Recorded; not yet on their page.", tone: "info", next: ["ATTACHED", "FAILED"] },
    ATTACHED: { label: "Video ready", description: "On their page and ready to send.", tone: "positive", next: ["QUEUED"] },
    FAILED: { label: "Video failed", description: "The last attempt failed; it can be queued again.", tone: "negative", next: ["QUEUED"] },
  },
});
