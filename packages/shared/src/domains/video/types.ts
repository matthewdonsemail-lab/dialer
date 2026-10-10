export const VIDEO_STATES = ["NONE", "QUEUED", "RECORDING", "RENDERED", "ATTACHED", "FAILED"] as const;
export type VideoState = (typeof VIDEO_STATES)[number];
