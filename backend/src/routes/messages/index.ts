import { Router } from "express";
import { authMiddleware, AuthRequest } from "../../middleware/auth.js";
import {
  listTwentyAll,
  createTwenty,
  updateTwenty,
  getTwenty,
} from "../../lib/twenty/client/index.js";
import { telnyxClient, telnyxErrorMessage } from "../../lib/telnyx/index.js";
import { createLogger } from "../../lib/logger/index.js";
import type { AgencyMessage, SendMessageBody } from "./types.js";

const router = Router();
router.use(authMiddleware);

const log = createLogger("messages");

/** +1555... — keep a single leading +, drop everything else non-numeric. */
export function normalizePhone(raw: unknown): string {
  const digits = String(raw ?? "").replace(/[^\d+]/g, "");
  return digits.startsWith("+") ? `+${digits.slice(1).replace(/\+/g, "")}` : digits;
}

interface ProfileResolution {
  profileId: string | null;
  reason: string;
  country: string | null;
  warning?: string;
}

/**
 * Messaging-profile resolution, same precedence as blaster (the standalone
 * SMS workstation this mirrors): number-bound profile first, then
 * recipient-country map, then the default profile with a warning.
 */
export function resolveMessagingProfile(to: string, numberProfileId?: string | null): ProfileResolution {
  if (numberProfileId) {
    return { profileId: numberProfileId, reason: "bound-to-number", country: countryOf(to) };
  }
  const country = countryOf(to);
  const map = parseProfileMap(process.env.TELNYX_MESSAGING_PROFILES || "");
  const mapped =
    (country && map[country]) ||
    (country === "US" && process.env.TELNYX_MESSAGING_PROFILE_US) ||
    (country === "IE" && process.env.TELNYX_MESSAGING_PROFILE_IE) ||
    null;
  if (country && mapped) {
    return { profileId: mapped, reason: "recipient-country", country };
  }
  const fallback = process.env.TELNYX_MESSAGING_PROFILE_ID || "";
  if (fallback) {
    return {
      profileId: fallback,
      reason: "default-fallback",
      country,
      warning: country
        ? `No messaging profile is registered for ${country}. Falling back to the default profile, which is not registered for that jurisdiction, so the carrier may reject the message.`
        : "No country detected. Falling back to the default profile.",
    };
  }
  return { profileId: null, reason: "no-profile-configured", country };
}

function countryOf(to: string): string | null {
  const digits = normalizePhone(to).replace(/^\+/, "");
  if (digits.startsWith("353")) return "IE";
  if (digits.startsWith("44")) return "GB";
  if (digits.startsWith("1")) return "US";
  return null;
}

function parseProfileMap(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of raw.split(",")) {
    const [country, id] = part.split("=").map((s) => s.trim());
    if (country && id) out[country.toUpperCase()] = id;
  }
  return out;
}

function mapMessage(row: AgencyMessage) {
  return {
    id: row.id,
    direction: row.direction || "OUTBOUND",
    status: row.status || null,
    body: row.body || "",
    fromNumber: row.fromNumber || "",
    toNumber: row.toNumber || "",
    telnyxMessageId: row.telnyxMessageId || null,
    agencyProspectId: row.agencyProspectId || null,
    agencyLeadId: row.agencyLeadId || null,
    createdAt: row.createdAt || null,
  };
}

async function recordPhoneOf(kind: "prospect" | "lead", id: string): Promise<string | null> {
  try {
    const row = await getTwenty(kind === "prospect" ? "agencyProspects" : "agencyLeads", id);
    const phone = (row as any)?.phone ?? (row as any)?.phoneNumber ?? null;
    return phone ? normalizePhone(phone) : null;
  } catch {
    return null;
  }
}

// GET /api/messages?prospectId=&leadId= — thread for one record, oldest first.
router.get("/", async (req, res) => {
  try {
    const prospectId = typeof req.query.prospectId === "string" ? req.query.prospectId : null;
    const leadId = typeof req.query.leadId === "string" ? req.query.leadId : null;
    if (!prospectId && !leadId) {
      res.status(400).json({ error: "prospectId or leadId is required" });
      return;
    }
    const recordPhone = prospectId
      ? await recordPhoneOf("prospect", prospectId)
      : await recordPhoneOf("lead", leadId as string);
    const rows = await listTwentyAll<AgencyMessage>("agencyMessages");
    const thread = rows.filter((r) => {
      if (prospectId && r.agencyProspectId === prospectId) return true;
      if (leadId && r.agencyLeadId === leadId) return true;
      if (!recordPhone) return false;
      return normalizePhone(r.fromNumber) === recordPhone || normalizePhone(r.toNumber) === recordPhone;
    });
    thread.sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
    res.json(thread.map(mapMessage));
  } catch (err: any) {
    if (String(err?.message || "").includes("agencyMessages") || err?.status === 404) {
      res.status(404).json({ error: "agencyMessages is not set up yet — run POST /api/setup/twenty" });
      return;
    }
    log.error("Failed to list messages:", err.message);
    res.status(500).json({ error: "Failed to list messages", details: err.message });
  }
});

// POST /api/messages/send — send one SMS through Telnyx and log it.
router.post("/send", async (req: AuthRequest, res) => {
  try {
    const { prospectId, leadId, to, fromPhoneId, from, body } = req.body as SendMessageBody;
    const text = (body || "").trim();
    if (!to || !text) {
      res.status(400).json({ error: "to and body are required" });
      return;
    }
    if (text.length > 1600) {
      res.status(400).json({ error: "Message is too long (1600 characters max)" });
      return;
    }
    const dest = normalizePhone(to);
    if (dest.replace(/\D/g, "").length < 7) {
      res.status(400).json({ error: "to is not a valid phone number" });
      return;
    }

    // Sender must be a known agency number (the from-selector lists these).
    let fromNumber = from ? normalizePhone(from) : "";
    let boundProfileId: string | null = null;
    if (fromPhoneId) {
      let phone: any;
      try {
        phone = await getTwenty("agencyPhones", fromPhoneId);
      } catch {
        res.status(404).json({ error: "Sending number not found" });
        return;
      }
      const active = (phone.state || phone.status || "ACTIVE").toString().toUpperCase() === "ACTIVE";
      if (!active) {
        res.status(409).json({ error: "Sending number is not ACTIVE" });
        return;
      }
      fromNumber = normalizePhone(phone.phoneNumber || phone.name || "");
      boundProfileId = phone.messagingProfileId || null;
    } else if (fromNumber) {
      const numbers = await listTwentyAll<any>("agencyPhones");
      const match = numbers.find((n) => normalizePhone(n.phoneNumber || n.name || "") === fromNumber);
      if (!match) {
        res.status(400).json({ error: "from must be one of your agency phone numbers" });
        return;
      }
      boundProfileId = match.messagingProfileId || null;
    } else {
      res.status(400).json({ error: "fromPhoneId or from is required" });
      return;
    }

    const resolution = resolveMessagingProfile(dest, boundProfileId);
    if (!resolution.profileId) {
      res.status(409).json({
        error: "No messaging profile for this send",
        detail:
          "The sending number has no messagingProfileId and no country/default profile is configured. " +
          "Set messagingProfileId on the agencyPhones row or add TELNYX_MESSAGING_PROFILE_ID.",
      });
      return;
    }

    let tx;
    try {
      tx = telnyxClient();
    } catch (err: any) {
      res.status(500).json({ error: err.message });
      return;
    }
    let sent: any;
    try {
      sent = await (tx as any).messages.send({
        from: fromNumber,
        to: dest,
        text,
        messaging_profile_id: resolution.profileId,
      });
    } catch (err: any) {
      log.info(`Telnyx send failed: ${telnyxErrorMessage(err)}`);
      res.status(502).json({ error: "Telnyx send failed", details: telnyxErrorMessage(err) });
      return;
    }
    const data = sent?.data ?? sent ?? {};
    const toEntry = Array.isArray(data.to) ? data.to[0] : null;
    const telnyxId: string | null = data.id || null;
    const status: string = toEntry?.status || data.status || "sent";
    if (resolution.warning) log.info(`Send warning (${dest}): ${resolution.warning}`);

    // Log the outbound leg in Twenty (the thread both pages render).
    let logged: AgencyMessage | null = null;
    try {
      logged = await createTwenty<AgencyMessage>("agencyMessages", {
        name: `OUT ${dest} ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
        direction: "OUTBOUND",
        status,
        body: text,
        fromNumber,
        toNumber: dest,
        telnyxMessageId: telnyxId,
        ...(prospectId ? { agencyProspectId: prospectId } : {}),
        ...(leadId ? { agencyLeadId: leadId } : {}),
      });
    } catch (err: any) {
      // Sent is sent — the ledger write failing must not fail the request,
      // but it must be loud: without the row the thread has a hole.
      log.error(`SMS sent but NOT logged (thread hole): ${err.message}`);
    }

    res.json({
      sent: { id: telnyxId, status, from: fromNumber, to: dest, profileId: resolution.profileId },
      resolution: { reason: resolution.reason, country: resolution.country, warning: resolution.warning ?? null },
      message: logged ? mapMessage(logged) : null,
    });
  } catch (err: any) {
    log.error("Failed to send message:", err.message);
    res.status(500).json({ error: "Failed to send message", details: err.message });
  }
});

// PATCH /api/messages/:id — status updates (delivery receipts).
router.patch("/:id", async (req, res) => {
  try {
    const allowed = ["status", "body"] as const;
    const patch: Record<string, unknown> = {};
    for (const key of allowed) {
      if (req.body?.[key] !== undefined) patch[key] = req.body[key];
    }
    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: "Nothing to update" });
      return;
    }
    const updated = await updateTwenty<AgencyMessage>("agencyMessages", req.params.id as string, patch);
    res.json(mapMessage(updated));
  } catch (err: any) {
    log.error("Failed to update message:", err.message);
    res.status(500).json({ error: "Failed to update message", details: err.message });
  }
});

export default router;
