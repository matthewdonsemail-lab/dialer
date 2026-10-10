/** Twenty sends every object event; only new leads become a push. */
const CREATED_LEAD_EVENTS = new Set(["agencyLead.created", "agencyLeads.created"]);

/** Pure: true when this event should trigger the new-lead broadcast. */
export function isNewLeadEvent(event: unknown): event is string {
  return typeof event === "string" && CREATED_LEAD_EVENTS.has(event);
}

/** Pull the record id out of a webhook payload; null when absent. */
export function recordIdFrom(data: unknown): string | null {
  const id = (data as { id?: unknown } | null)?.id;
  return typeof id === "string" && id ? id : null;
}