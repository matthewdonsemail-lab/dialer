/** agencyOffer.status: whether an industry's offer copy is live on the offer site. */
export const OFFER_STATES = ["DRAFT", "ACTIVE", "PAUSED"] as const;
export type OfferState = (typeof OFFER_STATES)[number];
