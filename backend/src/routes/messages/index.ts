import { Router } from "express";
import { authMiddleware, AuthRequest } from "../../middleware/auth.js";
import { createTwenty, getTwenty, listTwenty, updateTwenty } from "../../lib/twenty/client/index.js";
import { resolveActor } from "../../lib/twenty/actor/index.js";
import { createLogger } from "../../lib/logger/index.js";
import { checkSmsRoute, onPageSent, toE164 } from "@dialer/shared";
import { selectValue } from "../prospects/helpers/index.js";
import type { AgencyMessage } from "./types.js";
import { FAILED_STATUSES, oldestFirst, PENDING_STATUSES, preview, telnyxSendResult, toMessageView } from "./helpers/index.js";
import { touchConversation } from "./thread.js";

const router = Router();
router.use(authMiddleware);
const log = createLogger("messages");

const TELNYX = "https://api.telnyx.com/v2";
const telnyxHeaders = () => ({ Authorization: `Bearer ${process.env.TELNYX_API_KEY ?? ""}`, "Content-Type": "application/json" });

type ContactType = "prospect" | "lead";

/** The contact's record and every number it can be texted on (E.164). */
async function loadContact(type: ContactType, id: string) {
  const record: any = await getTwenty(type === "lead" ? "agencyLeads" : "agencyProspects", id);
  const numbers = new Set<string>();
  for (const raw of [record?.phone, record?.phoneNumber, record?.primaryPhone]) {
    const e164 = toE164(raw);
    if (e164) numbers.add(e164);
  }
  return { record, numbers: [...numbers] };
}

/** Messages to or from any of these numbers, newest first (at most 200). */
async function messagesFor(numbers: string[]): Promise<AgencyMessage[]> {
  if (!numbers.length) return [];
  const clauses = numbers.flatMap((n) => [`fromNumber[eq]:"${n}"`, `toNumber[eq]:"${n}"`]);
  return listTwenty<AgencyMessage>("agencyMessages", {
    limit: 200,
    filter: clauses.length > 1 ? `or(${clauses.join(",")})` : clauses[0],
    query: { order_by: "createdAt[DescNullsLast]" },
  });
}

/**
 * Re-ask Telnyx about a few recent outbound texts still in flight, so the
 * thread shows delivered / failed without a public webhook (local dev).
 */
async function refreshPending(rows: AgencyMessage[]): Promise<void> {
  const hourAgo = Date.now() - 60 * 60 * 1000;
  const pending = rows
    .filter((m) => m.telnyxMessageId && PENDING_STATUSES.has(String(m.status ?? "").toLowerCase()) && Date.parse(m.createdAt ?? "") > hourAgo)
    .slice(0, 5);
  await Promise.all(
    pending.map(async (m) => {
      try {
        const res = await fetch(`${TELNYX}/messages/${encodeURIComponent(m.telnyxMessageId!)}`, { headers: telnyxHeaders() });
        if (!res.ok) return;
        const { status, error } = telnyxSendResult(await res.json());
        if (status && status !== String(m.status).toLowerCase()) {
          await updateTwenty("agencyMessages", m.id, { status, ...(error ?? {}) });
          m.status = status;
          if (error) Object.assign(m, error);
        }
      } catch (err: any) {
        log.info(`Status refresh skipped for ${m.id}: ${err.message}`);
      }
    }),
  );
}

function parseContact(req: AuthRequest): { type: ContactType; id: string } | null {
  const src = { ...req.query, ...(req.body ?? {}) } as Record<string, unknown>;
  const type = src.contactType === "lead" ? "lead" : src.contactType === "prospect" ? "prospect" : null;
  const id = typeof src.contactId === "string" ? src.contactId : "";
  return type && /^[0-9a-f-]{36}$/i.test(id) ? { type, id } : null;
}

/**
 * A failed text whose record does not say why yet (sent before the error
 * fields existed, or failed with no webhook): ask Telnyx once and write the
 * reason onto the agencyMessage, so Twenty shows it too.
 */
async function backfillFailure(m: AgencyMessage): Promise<void> {
  try {
    const res = await fetch(`${TELNYX}/messages/${encodeURIComponent(m.telnyxMessageId!)}`, { headers: telnyxHeaders() });
    if (!res.ok) return;
    const { error } = telnyxSendResult(await res.json());
    if (!error) return;
    await updateTwenty("agencyMessages", m.id, error);
    Object.assign(m, error);
  } catch (err: any) {
    log.info(`Failure reason not recorded for ${m.id}: ${err.message}`);
  }
}

/** GET /api/messages?contactType=&contactId= — the contact's texts, oldest first. */
router.get("/", async (req: AuthRequest, res) => {
  const who = parseContact(req);
  if (!who) return res.status(400).json({ error: "contactType (prospect|lead) and contactId are required" });
  try {
    const { numbers } = await loadContact(who.type, who.id);
    const rows = await messagesFor(numbers);
    await refreshPending(rows);
    const unexplained = rows.filter((m) => m.telnyxMessageId && !m.errorCode && FAILED_STATUSES.has(String(m.status ?? "").toLowerCase())).slice(0, 5);
    await Promise.all(unexplained.map(backfillFailure));
    res.json({ numbers, messages: oldestFirst(rows.map(toMessageView)) });
  } catch (err: any) {
    log.error("Failed to load messages:", err.message);
    res.status(500).json({ error: "Could not load the texts for this contact", details: err.message });
  }
});

/**
 * POST /api/messages/send {contactType, contactId, fromPhoneId, body}
 * Sends through Telnyx from one of our numbers, stores the agencyMessage and
 * the thread, and moves a prospect's outreach to SMS in progress. Refuses a
 * contact who opted out (409) and a cross-country send (422).
 */
router.post("/send", async (req: AuthRequest, res) => {
  const who = parseContact(req);
  const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
  const fromPhoneId = typeof req.body?.fromPhoneId === "string" ? req.body.fromPhoneId : "";
  if (!who || !body || !fromPhoneId) return res.status(400).json({ error: "contactType, contactId, fromPhoneId and body are required" });
  if (body.length > 1600) return res.status(400).json({ error: "That text is longer than 1600 characters (10 segments)." });
  if (!process.env.TELNYX_API_KEY) return res.status(503).json({ error: "Texting is not set up: TELNYX_API_KEY is missing on the server." });

  try {
    const { record, numbers } = await loadContact(who.type, who.id);
    const to = numbers[0];
    if (!to) return res.status(422).json({ error: "This contact has no phone number that can receive a text.", code: "NO_NUMBER" });
    const optedOut = selectValue(record?.coldCallStatus) === "DO_NOT_CONTACT" || selectValue(record?.outboundLabel) === "DO_NOT_CONTACT";
    if (optedOut) return res.status(409).json({ error: "This contact opted out. Do not text them.", code: "OPTED_OUT" });

    const phone: any = await getTwenty("agencyPhones", fromPhoneId);
    const from = toE164(phone?.phoneNumber);
    if (!from) return res.status(422).json({ error: "The number you are texting from is not a valid E.164 number.", code: "BAD_FROM" });
    const route = checkSmsRoute({ number: from, country: phone?.countryCode }, { number: to, country: record?.country });
    if (!route.ok) return res.status(422).json({ error: route.reason, code: "SMS_ROUTE_BLOCKED" });
    const profile = phone?.messagingProfileId || process.env.TELNYX_MESSAGING_PROFILE_ID;

    const sent = await fetch(`${TELNYX}/messages`, {
      method: "POST",
      headers: telnyxHeaders(),
      body: JSON.stringify({ from, to, text: body, ...(profile ? { messaging_profile_id: profile } : {}) }),
    });
    const json: any = await sent.json().catch(() => ({}));
    if (!sent.ok) {
      const detail = json?.errors?.[0]?.detail || json?.errors?.[0]?.title || `Telnyx answered ${sent.status}`;
      log.error(`Telnyx refused a text to ${to}: ${detail}`);
      return res.status(502).json({ error: `Telnyx did not send the text: ${detail}`, code: "TELNYX_REFUSED" });
    }
    const result = telnyxSendResult(json);

    const actor = await resolveActor(req);
    const at = new Date().toISOString();
    const row = await createTwenty<AgencyMessage>(
      "agencyMessages",
      { name: preview(body), body, direction: "OUTBOUND", fromNumber: from, toNumber: to, status: result.status, telnyxMessageId: result.id, ...(result.error ?? {}) },
      actor,
    );

    // The thread and the pipeline are bookkeeping: the text already went out.
    try {
      await touchConversation(from, to, String(record?.name ?? to), { id: row.id, body, direction: "OUTBOUND", at });
    } catch (err: any) {
      log.info(`Conversation not updated: ${err.message}`);
    }
    if (who.type === "prospect") {
      const step = onPageSent(selectValue(record?.outboundLabel));
      if (step.ok && step.changed) {
        await updateTwenty("agencyProspects", who.id, { outboundLabel: step.to }, actor).catch((err: any) => log.info(`outboundLabel not advanced: ${err.message}`));
      }
    }

    log.info(`Text sent ${from} -> ${to} (${result.status}, ${result.parts ?? "?"} parts)`);
    res.status(201).json({ message: toMessageView({ ...row, createdAt: row.createdAt ?? at, status: result.status }), failed: FAILED_STATUSES.has(result.status) });
  } catch (err: any) {
    log.error("Failed to send a text:", err.message);
    res.status(500).json({ error: "The text could not be sent", details: err.message });
  }
});

export default router;
