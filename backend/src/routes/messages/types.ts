/** agencyMessage as Twenty stores it (shared with Blaster: TEXT fields, Telnyx status words). */
export interface AgencyMessage {
  id: string;
  name?: string | null;
  body?: string | null;
  direction?: string | null;
  fromNumber?: string | null;
  toNumber?: string | null;
  status?: string | null;
  telnyxMessageId?: string | null;
  createdAt?: string;
  createdBy?: { name?: string | null; workspaceMemberId?: string | null } | null;
}

/** agencyConversation: one thread per pair of numbers (ours, theirs). */
export interface AgencyConversation {
  id: string;
  pairKey?: string | null;
  peerPhone?: string | null;
  blasterNumber?: string | null;
  messageCount?: number | null;
}

/** One message as the contact page shows it. */
export interface MessageView {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  body: string;
  fromNumber: string | null;
  toNumber: string | null;
  /** Telnyx's word: queued, sending, sent, delivered, sending_failed, delivery_failed, received... */
  status: string | null;
  at: string | null;
  author: string | null;
  /** Why it failed, in Telnyx's words (e.g. "Not 10DLC registered (40010)"). */
  error?: string | null;
}
