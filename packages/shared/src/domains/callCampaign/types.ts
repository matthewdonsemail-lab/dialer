/** callCampaign.status: a power-dialer campaign's lifecycle. */
export const CALL_CAMPAIGN_STATES = ["ACTIVE", "COMPLETED", "ARCHIVED"] as const;
export type CallCampaignState = (typeof CALL_CAMPAIGN_STATES)[number];
