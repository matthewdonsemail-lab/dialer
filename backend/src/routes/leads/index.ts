import { Router } from "express";
import { authMiddleware, AuthRequest } from "../../middleware/auth.js";
import { listTwenty, listTwentyAll, createTwenty, updateTwenty, deleteTwenty, getTwenty } from "../../lib/twenty/client/index.js";
import { createLogger } from "../../lib/logger/index.js";
import { resolveActor } from "../../lib/twenty/actor/index.js";
import { broadcastNewLead, markLeadNotified } from "../../lib/leads/notify/index.js";
import type { AgencyCampaign, AgencyLead } from "./types.js";
import { mapLeadToFrontend, frontendStatusToTwenty, toTwentyPhone, toTwentyEmail, getLeadCallCounts } from "./helpers/index.js";

const router = Router();
router.use(authMiddleware);

const log = createLogger('leads');

router.get("/", async (_req, res) => {
  try {
    log.info('Listing leads from Twenty CRM');
    const leads = await listTwentyAll<AgencyLead>('agencyLeads');

    // Fetch campaigns to resolve campaign types
    let campaignMap: Record<string, string> = {};
    try {
      const campaigns = await listTwenty<AgencyCampaign>('agencyCampaigns', 100);
      campaignMap = Object.fromEntries(campaigns.map(c => [c.id, c.utmSource || 'outbound']));
    } catch {
      // Campaign lookup is best-effort; proceed without it
    }

    // Real per-lead call counts in one fetch (best-effort; see helper)
    const callCounts = await getLeadCallCounts();

    const mapped = leads.map(lead => mapLeadToFrontend(lead, campaignMap, callCounts.get(lead.id) ?? 0));

    log.info(`Returning ${mapped.length} leads`);
    res.json(mapped);
  } catch (err: any) {
    log.error("Failed to list leads:", err.message);
    res.status(500).json({ error: "Failed to fetch leads from Twenty", details: err.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    log.info(`Getting lead ${req.params.id}`);
    const id = req.params.id as string;
    const lead = await getTwenty<AgencyLead>('agencyLeads', id);

    // Fetch campaigns to resolve campaign types
    let campaignMap: Record<string, string> = {};
    try {
      const campaigns = await listTwenty<AgencyCampaign>('agencyCampaigns', 100);
      campaignMap = Object.fromEntries(campaigns.map(c => [c.id, c.utmSource || 'outbound']));
    } catch {
      // Campaign lookup is best-effort; proceed without it
    }

    const mapped = mapLeadToFrontend(lead, campaignMap, (await getLeadCallCounts()).get(lead.id) ?? 0);

    res.json(mapped);
  } catch (err: any) {
    log.error(`Failed to get lead ${req.params.id}:`, err.message);
    res.status(404).json({ error: "Lead not found" });
  }
});

router.post("/", async (req: AuthRequest, res) => {
  try {
    const {
      first_name, last_name, company, phone, email, website,
      address, city, state, zip, status, source, campaign_id,
      assigned_to, tags, notes, dnc,
    } = req.body;

    const fullName = [first_name, last_name].filter(Boolean).join(" ").trim();
    
    // Map our status to Twenty's coldCallStatus
    const coldCallStatus = frontendStatusToTwenty(status, dnc);

    log.info(`Creating lead: ${fullName}`);
    
    const payload = {
      contactName: fullName,
      email: toTwentyEmail(email),
      phone: toTwentyPhone(phone),
      company: company,
      status: coldCallStatus === "DO_NOT_CONTACT" ? "LOST" : "NEW",
      coldCallStatus,
      source: source,
      note: notes,
      outboundMessage: undefined,
      // createdById: the resolved workspaceMember UUID when the session
      // resolved to one, otherwise the legacy email. The Actor below is the
      // authoritative "created by" stamp Twenty displays.
      createdById: req.workspaceMemberId ?? req.twentyUserId,
    };

    const result = await createTwenty<any>('agencyLeads', payload, await resolveActor(req));
    const lead = result.data || result;
    
    const mapped = {
      id: lead.id,
      first_name,
      last_name,
      company,
      phone,
      email,
      website,
      address,
      city,
      state,
      zip,
      status: coldCallStatus === "DO_NOT_CONTACT" ? "not_interested" : "new",
      source,
      campaign_id: campaign_id,
      assigned_to: req.workspaceMemberId ?? req.twentyUserId,
      tags: tags ? JSON.stringify(tags) : null,
      notes,
      dnc: Boolean(dnc),
      last_called_at: null,
      call_count: 0,
      sync_id: lead.outboundMessage || undefined,
      created_at: lead.createdAt || new Date().toISOString(),
      updated_at: lead.updatedAt || new Date().toISOString(),
    };

    log.info(`Created lead ${lead.id}`);
    // Global Bark broadcast to every member with a BARK_KEY.
    // Fire-and-forget: a push failure must never fail the lead creation.
    // Mark first so the Twenty webhook (agencyLead.created) dedupes this id.
    markLeadNotified(String(lead.id));
    void broadcastNewLead(req, {
      id: String(lead.id),
      contactName: fullName || null,
      company: company || null,
      phone: phone || null,
      email: email || null,
    }).catch((err: any) => log.error(`New-lead broadcast failed: ${err?.message || err}`));
    res.status(201).json(mapped);
  } catch (err: any) {
    log.error("Failed to create lead:", err.message);
    res.status(500).json({ error: "Failed to create lead in Twenty", details: err.message });
  }
});

router.patch("/:id", async (req: AuthRequest, res) => {
  try {
    log.info(`Updating lead ${req.params.id}`);
    
    const {
      first_name, last_name, company, phone, email, website,
      address, city, state, zip, status, source, campaign_id,
      assigned_to, tags, notes, dnc,
    } = req.body;

    const payload: any = {};
    
    if (first_name !== undefined || last_name !== undefined) {
      const fullName = [first_name, last_name].filter(Boolean).join(" ").trim();
      if (fullName) payload.contactName = fullName;
    }
    
    if (company !== undefined) payload.company = company;
    // Empty phone/email means "no value": omit the key so Twenty keeps its
    // validated state instead of rejecting an empty composite.
    if (phone !== undefined) {
      const twentyPhone = toTwentyPhone(phone);
      if (twentyPhone !== undefined) payload.phone = twentyPhone;
    }
    if (email !== undefined) {
      const twentyEmail = toTwentyEmail(email);
      if (twentyEmail !== undefined) payload.email = twentyEmail;
    }
    if (notes !== undefined) payload.note = notes;
    if (source !== undefined) payload.source = source;

    // Handle campaign relation
    if (campaign_id !== undefined) {
      payload.campaignIdId = campaign_id || null;
    }
    
    // Map status
    if (status !== undefined) {
      payload.coldCallStatus = frontendStatusToTwenty(status, dnc);
    }

    if (Object.keys(payload).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    const id = req.params.id as string;
    const result = await updateTwenty<any>('agencyLeads', id, payload, await resolveActor(req));
    const lead = result.data || result;

    // Fetch campaigns to resolve campaign types
    let campaignMap: Record<string, string> = {};
    try {
      const campaigns = await listTwenty<AgencyCampaign>('agencyCampaigns', 100);
      campaignMap = Object.fromEntries(campaigns.map(c => [c.id, c.utmSource || 'outbound']));
    } catch {
      // Campaign lookup is best-effort; proceed without it
    }

    // Return mapped response
    const mapped = mapLeadToFrontend(lead, campaignMap, (await getLeadCallCounts()).get(lead.id) ?? 0);

    log.info(`Updated lead ${lead.id}`);
    res.json(mapped);
  } catch (err: any) {
    log.error(`Failed to update lead ${req.params.id}:`, err.message);
    res.status(500).json({ error: "Failed to update lead in Twenty", details: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    log.info(`Deleting lead ${req.params.id}`);
    const id = req.params.id as string;
    
    await deleteTwenty('agencyLeads', id);
    
    log.info(`Deleted lead ${id}`);
    res.status(204).end();
  } catch (err: any) {
    log.error(`Failed to delete lead ${req.params.id}:`, err.message);
    res.status(500).json({ error: "Failed to delete lead from Twenty", details: err.message });
  }
});

export default router;
