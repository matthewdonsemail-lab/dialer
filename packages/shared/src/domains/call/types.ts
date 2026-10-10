export const CALL_RESULTS = ["IN_PROGRESS", "COMPLETED", "FAILED", "NO_ANSWER", "BUSY"] as const;
export type CallResult = (typeof CALL_RESULTS)[number];
