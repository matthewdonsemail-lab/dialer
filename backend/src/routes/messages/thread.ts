import { createTwenty, listTwenty, updateTwenty } from "../../lib/twenty/client/index.js";
import type { AgencyConversation } from "./types.js";
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

