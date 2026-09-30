/** Twenty POSTs { event, data, timestamp }; we only act on new leads. */
export interface TwentyWebhookBody {
  event?: unknown;
  data?: unknown;
}

export interface WebhookActor {
  workspaceMemberId: string;
  email: string;
  name: string;
  phone: string | null;
}