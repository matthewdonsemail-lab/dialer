import { createTwenty, listTwenty, updateTwenty } from "../../lib/twenty/client/index.js";
import { createLogger } from "../../lib/logger/index.js";
import type { AgencyMessage } from "./types.js";
import { preview, TELNYX_RECEIVED } from "./helpers/index.js";
import { touchConversation } from "./thread.js";

const log = createLogger("messages");

async function findByTelnyxId(id: string): Promise<AgencyMessage | null> {
  const rows = await listTwenty<AgencyMessage>("agencyMessages", { limit: 1, filter: `telnyxMessageId[eq]:"${id}"` });
  return rows[0] ?? null;
}

/**
 * Telnyx messaging webhooks (the messaging profile's webhook URL must point
 * at this server): a reply becomes an INBOUND agencyMessage on the thread,
 * and delivery reports update the status of the text we sent. Retries are
 * safe: rows are found by telnyxMessageId first. Returns null for events
 * that are not about messages.
 */
export async function handleMessageEvent(eventType: string, payload: any): Promise<string | null> {
  if (!eventType.startsWith("message.")) return null;
  const id: string | undefined = payload?.id;
  if (!id) return "no message id";

  if (eventType === "message.received") {
    if (await findByTelnyxId(id)) return "already recorded";
    const from: string = payload?.from?.phone_number ?? "";
    const to: string = payload?.to?.[0]?.phone_number ?? "";
    const body: string = payload?.text ?? "";
    const row = await createTwenty<AgencyMessage>("agencyMessages", {
      name: preview(body || "(no text)"),
      body,
      direction: "INBOUND",
      fromNumber: from,
      toNumber: to,
      status: TELNYX_RECEIVED,
      telnyxMessageId: id,
    });
    try {
      await touchConversation(to, from, from, { id: row.id, body, direction: "INBOUND", at: payload?.received_at ?? new Date().toISOString() });
    } catch (err: any) {
      log.info(`Conversation not updated for a reply: ${err.message}`);
    }
    return "reply recorded";
  }

  if (eventType === "message.sent" || eventType === "message.finalized") {
    const status = String(payload?.to?.[0]?.status ?? "").toLowerCase();
    const existing = await findByTelnyxId(id);
    if (!existing || !status) return "not ours";
    if (status !== String(existing.status ?? "").toLowerCase()) await updateTwenty("agencyMessages", existing.id, { status });
    return `status ${status}`;
  }
  return "ignored";
}
