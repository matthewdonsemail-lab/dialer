import { createTwenty, getTwenty, listTwenty, updateTwenty } from "../../lib/twenty/client/index.js";
import { toE164 } from "@dialer/shared";
import type { AgencyConversation, AgencyMessage } from "./types.js";
import { pairKey, preview } from "./helpers/index.js";

/** Find or create the thread for (our number, their number) and record the latest message. */
export async function touchConversation(ours: string, theirs: string, name: string, message: { id: string; body: string; direction: string; at: string }) {
  const key = pairKey(ours, theirs);
  const existing = await listTwenty<AgencyConversation>("agencyConversations", { limit: 1, filter: `pairKey[eq]:"${key}"` });
  const latest = {
    latestMessageId: message.id,
    latestMessageAt: message.at,
    latestPreview: preview(message.body, 140),
    latestDirection: message.direction,
  };
  if (existing[0]) {
    await updateTwenty("agencyConversations", existing[0].id, { ...latest, messageCount: (existing[0].messageCount ?? 0) + 1 });
  } else {
    await createTwenty("agencyConversations", { name, pairKey: key, peerPhone: theirs, blasterNumber: ours, messageCount: 1, ...latest });
  }
}


export type ContactType = "prospect" | "lead";

/** The contact's record and every number it can be texted on (E.164). */
export async function loadContact(type: ContactType, id: string) {
  const record: any = await getTwenty(type === "lead" ? "agencyLeads" : "agencyProspects", id);
  const numbers = new Set<string>();
  for (const raw of [record?.phone, record?.phoneNumber, record?.primaryPhone]) {
    const e164 = toE164(raw);
    if (e164) numbers.add(e164);
  }
  return { record, numbers: [...numbers] };
}

/** Messages to or from any of these numbers, newest first (at most 200). */
export async function messagesFor(numbers: string[]): Promise<AgencyMessage[]> {
  if (!numbers.length) return [];
  const clauses = numbers.flatMap((n) => [`fromNumber[eq]:"${n}"`, `toNumber[eq]:"${n}"`]);
  return listTwenty<AgencyMessage>("agencyMessages", {
    limit: 200,
    filter: clauses.length > 1 ? `or(${clauses.join(",")})` : clauses[0],
    query: { order_by: "createdAt[DescNullsLast]" },
  });
}

