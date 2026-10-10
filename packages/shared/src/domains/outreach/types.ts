/** agencyProspect.outboundLabel: where a prospect is in the SMS outreach pipeline. */
export const OUTREACH_STAGES = [
  "NEEDS_ENRICHMENT",
  "NEEDS_VIDEO",
  "READY_FOR_SMS",
  "SMS_IN_PROGRESS",
  "FOLLOW_UP_DUE",
  "POSITIVE_REPLY",
  "NEGATIVE_REPLY",
  "HUMAN_REVIEW",
  "DELIVERY_FAILED",
  "DO_NOT_CONTACT",
] as const;

export type OutreachStage = (typeof OUTREACH_STAGES)[number];

/** A country we can tell from a number, or a region sharing one numbering plan. */
export type SmsRegion = "NANP" | "IE" | "GB" | "AU" | "NZ" | "DE" | "FR" | "ES" | "IT" | "NL";

export type SmsRouteCheck =
  | { ok: true; from: SmsRegion | null; to: SmsRegion | null; warning?: string }
  | { ok: false; from: SmsRegion; to: SmsRegion; reason: string };
