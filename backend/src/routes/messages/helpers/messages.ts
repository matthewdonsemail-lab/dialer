import type { AgencyMessage, MessageView } from "../types.js";

/** The thread key for a pair of numbers, ours first: "+15551234567|+353...". Pure. */
export function pairKey(ourNumber: string, peerNumber: string): string {
  return `${ourNumber}|${peerNumber}`;
}

/** Telnyx's status for a text we received (its vocabulary, not a dialer pipeline). */
export const TELNYX_RECEIVED = "received";

/** Telnyx statuses that may still change, so the thread re-asks Telnyx about them. Pure. */
export const PENDING_STATUSES = new Set(["queued", "sending", "sent", "delivery_unconfirmed"]);

/** Statuses that mean the text did not arrive. Pure. */
export const FAILED_STATUSES = new Set(["sending_failed", "delivery_failed", "gw_timeout", "failed"]);

/** The first line of a body, for the record name and the thread preview. Pure. */
export function preview(body: string, max = 80): string {
  const one = body.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}

/** Twenty row -> what the contact page shows. Pure. */
export function toMessageView(m: AgencyMessage): MessageView {
  return {
    id: m.id,
    direction: String(m.direction ?? "").toUpperCase() === "INBOUND" ? "INBOUND" : "OUTBOUND",
    body: m.body ?? "",
    fromNumber: m.fromNumber ?? null,
    toNumber: m.toNumber ?? null,
    status: m.status ? String(m.status).toLowerCase() : null,
    at: m.createdAt ?? null,
    author: m.createdBy?.name ?? null,
  };
}

/** Oldest first, the order a chat reads in. Pure. */
export function oldestFirst(messages: MessageView[]): MessageView[] {
  return [...messages].sort((a, b) => Date.parse(a.at ?? "") - Date.parse(b.at ?? ""));
}

/** Telnyx's send response -> the status and parts to store. Pure. */
export function telnyxSendResult(json: any): { id: string | null; status: string; parts: number | null } {
  const data = json?.data ?? {};
  return {
    id: typeof data.id === "string" ? data.id : null,
    status: String(data.to?.[0]?.status ?? "queued").toLowerCase(),
    parts: typeof data.parts === "number" ? data.parts : null,
  };
}
