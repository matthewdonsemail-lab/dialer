/** The values Twenty stores in coldCallStatus (prospects and leads). */
export const CONTACT_STATUSES = ["NEW", "CONTACTED", "INTERESTED", "CALLBACK", "NOT_INTERESTED", "CONVERTED", "DO_NOT_CONTACT"] as const;

export type ContactStatus = (typeof CONTACT_STATUSES)[number];
