import { Router, Response } from "express";
import { authMiddleware, AuthRequest } from "../../middleware/auth.js";
import { createLogger } from "../../lib/logger.js";
import { sendBarkPush } from "../../lib/bark.js";
import { broadcastNewLead } from "../../lib/lead-notify.js";
import { getTwenty } from "../../lib/twenty-client.js";
import {
  findWorkspaceMember,
  listWorkspaceMembers,
} from "../../lib/workspace-members.js";

const router = Router();
router.use(authMiddleware);

const log = createLogger("notify");

/**
 * GET /api/notify/bark/status
 * Who can receive Bark pushes? Never exposes the keys themselves —
 * returns hasBarkKey + addressing fields so the UI can show coverage.
 */
router.get("/bark/status", async (_req: AuthRequest, res: Response) => {
  try {
    const members = await listWorkspaceMembers();
    res.json({
      count: members.length,
      members: members.map((m) => ({
        id: m.id,
        userId: m.userId,
        userEmail: m.userEmail,
        firstName: m.firstName,
        lastName: m.lastName,
        hasBarkKey: Boolean(m.barkKey),
      })),
    });
  } catch (err: any) {
    log.error("Bark status failed:", err.message);
    res.status(500).json({ error: "Failed to read workspace members", details: err.message });
  }
});

interface BarkNotifyBody {
  email?: string;
  userId?: string;
  workspaceMemberId?: string;
  title?: string;
  subtitle?: string;
  body?: string;
  group?: string;
  url?: string;
  level?: "active" | "timeSensitive" | "passive" | "critical";
}

/**
 * POST /api/notify/bark
 * Resolve one workspace member (email | userId | workspaceMemberId —
 * defaults to the caller's JWT email), read their BARK_KEY from the
 * workspaceMember object metadata field `barkKey`, and push via Bark.
 */
router.post("/bark", async (req: AuthRequest, res: Response) => {
  try {
    const payload = (req.body ?? {}) as BarkNotifyBody;
    const text = (payload.body || "").trim();
    if (!text) {
      res.status(400).json({ error: "body is required" });
      return;
    }

    // Default to the authenticated operator so OAuth signups
    // ("system response" -> dialer JWT email) just work.
    const lookup = {
      email: payload.email || req.userEmail,
      userId: payload.userId || req.twentyUserId,
      workspaceMemberId: payload.workspaceMemberId,
    };

    const member = await findWorkspaceMember(lookup);
    if (!member) {
      res.status(404).json({ error: "Workspace member not found for lookup" });
      return;
    }
    if (!member.barkKey) {
      res.status(404).json({
        error: "Workspace member has no BARK_KEY configured",
        workspaceMemberId: member.id,
        userEmail: member.userEmail,
      });
      return;
    }

    const result = await sendBarkPush(member.barkKey, {
      title: payload.title?.trim() || "Dialer",
      subtitle: payload.subtitle?.trim(),
      body: text,
      group: payload.group?.trim(),
      url: payload.url?.trim(),
      level: payload.level,
    });

    if (!result.ok) {
      res.status(502).json({
        error: "Bark push failed",
        details: result.message,
        workspaceMemberId: member.id,
        userEmail: member.userEmail,
      });
      return;
    }

    log.info(`Bark push sent for member ${member.id}`);
    res.json({
      ok: true,
      workspaceMemberId: member.id,
      userEmail: member.userEmail,
      notified: true,
    });
  } catch (err: any) {
    log.error("Bark notify failed:", err.message);
    res.status(500).json({ error: "Failed to send Bark notification", details: err.message });
  }
});

/**
 * POST /api/notify/bark/lead/:id
 * Manual re-broadcast for an existing lead: reads the lead metadata
 * (contactName/company/phone/email) and pushes to ALL members with a
 * BARK_KEY. Same global path the auto-notify on POST /api/leads uses.
 */
router.post("/bark/lead/:id", async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const lead = await getTwenty<any>("agencyLeads", id);
    const contactName =
      lead.contactName || [lead.firstName, lead.lastName].filter(Boolean).join(" ") || null;
    const phone =
      typeof lead.phone === "object" && lead.phone
        ? lead.phone.primaryPhoneNumber || null
        : typeof lead.phone === "string"
          ? lead.phone
          : null;
    const result = await broadcastNewLead(req, {
      id: String(lead.id || id),
      contactName,
      company: lead.company || null,
      phone,
      email: lead.email || null,
    });
    res.json({ ok: true, leadId: id, ...result });
  } catch (err: any) {
    log.error("Lead re-broadcast failed:", err.message);
    res.status(500).json({ error: "Failed to broadcast lead notification", details: err.message });
  }
});

export default router;
