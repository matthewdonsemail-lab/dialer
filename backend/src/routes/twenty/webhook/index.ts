import { Router, Request, Response } from "express";
import { createLogger } from "../../../lib/logger/index.js";
import { getTwenty } from "../../../lib/twenty/client/index.js";
import {
  broadcastNewLead,
  markLeadNotified,
  wasRecentlyNotified,
} from "../../../lib/leads/notify/index.js";
import { isNewLeadEvent, recordIdFrom, verifySignature } from "./helpers/index.js";
import type { TwentyWebhookBody } from "./types.js";

const router = Router();
const log = createLogger("twenty-webhook");

/**
 * POST /api/twenty/webhook — Twenty native webhook receiver (no dialer JWT;
 * Twenty signs with HMAC, same pattern as frontend/api/telnyx-webhook.ts).
 *
 * Setup in Twenty: Settings -> APIs & Webhooks -> Webhooks -> URL
 *   https://<backend>/api/twenty/webhook
 * Twenty POSTs { event, data, timestamp } for every record change; we
 * filter to agencyLead.created, fetch the full lead, and run the same
 * global Bark broadcast the dialer POST /api/leads hook uses.
 *
 * Auth (either):
 * - HMAC: TWENTY_WEBHOOK_SECRET set -> validate
 *   X-Twenty-Webhook-Signature over "{timestamp}:{raw JSON body}".
 * - Token gate: ?token=<TWENTY_WEBHOOK_TOKEN> (Telnyx-webhook precedent).
 */
function isAuthorized(req: Request): boolean {
  const secret = (process.env.TWENTY_WEBHOOK_SECRET || "").trim();
  if (secret) {
    const ok = verifySignature({
      secret,
      timestamp: req.get("x-twenty-webhook-timestamp") || "",
      rawBody: (req as any).rawBody as Buffer | undefined,
      signature: req.get("x-twenty-webhook-signature") || "",
    });
    if (ok) return true;
    // Fall through to the token gate so rotation does not hard-fail.
  }
  const token = (process.env.TWENTY_WEBHOOK_TOKEN || "").trim();
  return Boolean(token) && req.query.token === token;
}

router.post("/", async (req: Request, res: Response) => {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: "Unauthorized webhook" });
    return;
  }

  const body = (req.body ?? {}) as TwentyWebhookBody;
  const event = body.event;

  // Ack everything 2xx so Twenty does not retry; ignore non-lead events.
  if (!isNewLeadEvent(event)) {
    res.json({ ok: true, ignored: typeof event === "string" ? event : null });
    return;
  }

  const leadId = recordIdFrom(body.data);
  if (!leadId) {
    log.error("agencyLead.created without data.id");
    res.json({ ok: true, ignored: "missing-id" });
    return;
  }

  // Dedupe: dialer-created leads already broadcast from POST /api/leads.
  if (wasRecentlyNotified(leadId)) {
    log.info(`Lead ${leadId} already notified, skipping webhook duplicate`);
    res.json({ ok: true, deduped: true, leadId });
    return;
  }
  markLeadNotified(leadId);

  try {
    const lead = await getTwenty<any>("agencyLeads", leadId);
    const contactName =
      lead.contactName ||
      [lead.firstName, lead.lastName].filter(Boolean).join(" ") ||
      (typeof body.data === "object" && body.data !== null
        ? ((body.data as any).contactName ?? null)
        : null);
    const phone =
      typeof lead.phone === "object" && lead.phone
        ? lead.phone.primaryPhoneNumber || null
        : typeof lead.phone === "string"
          ? lead.phone
          : null;
    const result = await broadcastNewLead(req, {
      id: String(lead.id || leadId),
      contactName,
      company: lead.company || null,
      phone,
      email: lead.email || null,
    });
    res.json({ ok: true, leadId, ...result });
  } catch (err: any) {
    log.error(`Webhook broadcast failed for lead ${leadId}: ${err.message}`);
    // Still 200: the lead exists, only the push failed — do not trigger
    // Twenty retries for a notification-side error.
    res.json({ ok: false, leadId, error: err.message });
  }
});

export default router;