import { Router, Request, Response } from "express";
import crypto from "crypto";
import { createLogger } from "../../../lib/logger.js";
import { getTwenty } from "../../../lib/twenty-client.js";
import {
  broadcastNewLead,
  markLeadNotified,
  wasRecentlyNotified,
} from "../../../lib/lead-notify.js";

const router = Router();
const log = createLogger("twenty-webhooks");

/**
 * POST /api/twenty/webhooks — Twenty native webhook receiver (no dialer JWT;
 * Twenty signs with HMAC, same pattern as frontend/api/telnyx-webhook.ts).
 *
 * Setup in Twenty: Settings → APIs & Webhooks → Webhooks → URL
 *   https://<backend>/api/twenty/webhooks
 * Twenty POSTs { event, data, timestamp } for every record change; we
 * filter to agencyLead.created, fetch the full lead, and run the same
 * global Bark broadcast the dialer POST /api/leads hook uses.
 *
 * Auth (either):
 * - HMAC: TWENTY_WEBHOOK_SECRET set → validate
 *   X-Twenty-Webhook-Signature over "{timestamp}:{raw JSON body}".
 * - Token gate: ?token=<TWENTY_WEBHOOK_TOKEN> (Telnyx-webhook precedent).
 */

const CREATED_EVENTS = new Set(["agencyLead.created", "agencyLeads.created"]);

function timingSafeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function isAuthorized(req: Request): boolean {
  const secret = (process.env.TWENTY_WEBHOOK_SECRET || "").trim();
  if (secret) {
    const sig = req.get("x-twenty-webhook-signature") || "";
    const ts = req.get("x-twenty-webhook-timestamp") || "";
    const raw = (req as any).rawBody as Buffer | undefined;
    if (!sig || !ts || !raw) return false;
    const expected = crypto
      .createHmac("sha256", secret)
      .update(`${ts}:${raw.toString("utf8")}`)
      .digest("hex");
    if (timingSafeEq(expected, sig.trim())) return true;
    // Fall through to token gate so rotation doesn't hard-fail.
  }
  const token = (process.env.TWENTY_WEBHOOK_TOKEN || "").trim();
  if (token && req.query.token === token) return true;
  return false;
}

router.post("/", async (req: Request, res: Response) => {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: "Unauthorized webhook" });
    return;
  }

  const body = (req.body ?? {}) as { event?: unknown; data?: unknown };
  const event = typeof body.event === "string" ? body.event : "";

  // Ack everything 2xx so Twenty doesn't retry; ignore non-lead events.
  if (!CREATED_EVENTS.has(event)) {
    res.json({ ok: true, ignored: event || null });
    return;
  }

  const data = (body.data ?? {}) as { id?: unknown };
  const leadId = typeof data.id === "string" ? data.id : null;
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
      (typeof data === "object" && data !== null
        ? ((data as any).contactName ?? null)
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
    // Still 200: the lead exists, only the push failed — don't trigger
    // Twenty retries for a notification-side error.
    res.json({ ok: false, leadId, error: err.message });
  }
});

export default router;
