import { Router } from "express";
import { authMiddleware, AuthRequest, requireMember } from "../../../middleware/auth.js";
import { getTwenty, updateTwenty, listTwentyAll } from "../../../lib/twenty/client/index.js";
import { resolveActor } from "../../../lib/twenty/actor/index.js";
import { twentyGraphqlClient } from "../../../lib/twenty/graphql/index.js";
import { createLogger } from "../../../lib/logger/index.js";
import type { AgencyPhone, ClaimBody, CallStateBody, ReleaseBody } from "./types.js";
import { mapPhone, isClaimStale } from "./helpers/index.js";

const router = Router();
router.use(authMiddleware);

const log = createLogger('phones');

/**
 * Holder identity for claim/heartbeat/state/release. Derived server-side
 * from the OAuth-resolved workspaceMember in the JWT — a `memberId` in the
 * request body is never trusted (a mismatched one is rejected so callers
 * cannot impersonate another member).
 */
function sessionHolder(req: AuthRequest, res: any): { id: string; email: string; name: string } | null {
  const member = requireMember(req, res);
  if (!member) return null;
  const claimed = (req.body as ClaimBody)?.memberId;
  if (claimed && claimed !== member.id) {
    res.status(403).json({ error: "memberId does not match the authenticated workspace member" });
    return null;
  }
  return member;
}

// In-memory mutex for atomic check-and-claim per phone ID
const pendingClaims = new Map<string, Promise<void>>();

async function acquirePhoneLock(phoneId: string): Promise<() => void> {
  while (pendingClaims.has(phoneId)) {
    await pendingClaims.get(phoneId);
  }
  let release: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  pendingClaims.set(phoneId, promise);
  return () => {
    pendingClaims.delete(phoneId);
    release!();
  };
}

router.get("/", async (_req, res) => {
  try {
    log.info('Fetching phones from Twenty CRM');

    // Typed read via the generated client (packages/shared) — same rows
    // the REST list returned, verified field-for-field (see A/B notes in
    // docs/naming-conventions.md). Writes stay on the REST wrappers below.
    // lastHeartbeatAt is selected because stale-claim masking needs it.
    const client = twentyGraphqlClient();
    const result = await client.query({
      agencyPhones: {
        __args: { first: 100 },
        edges: {
          node: {
            id: true,
            name: true,
            phoneNumber: true,
            countryCode: true,
            numberType: true,
            state: true,
            messagingProfileId: true,
            tenDlcCampaignId: true,
            tollFreeVerificationId: true,
            lastSyncedAt: true,
            eligibleProducts: true,
            features: true,
            health: true,
            callState: true,
            claimedByMemberId: true,
            claimedByEmail: true,
            claimedAt: true,
            lastHeartbeatAt: true,
            currentCallId: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });
    // The generated client types custom DATE_TIME selections loosely
    // (unknown); coerce to our precise AgencyPhone shape for the mappers.
    const phones: AgencyPhone[] = (result.agencyPhones?.edges ?? []).map((e) => e.node as AgencyPhone);

    log.info(`Found ${phones.length} phones`);

    res.json(phones.map(mapPhone));
  } catch (err: any) {
    log.error("Failed to fetch phones from Twenty:", err.message);
    res.status(500).json({ error: "Failed to fetch phone numbers from Twenty", details: err.message });
  }
});

/**
 * GET /api/twenty/phones/primary — single canonical agency number.
 *
 * All dialing derives from this row (never a hardcoded caller id, never a
 * pool pick per call). Resolution: AGENCY_PHONE_NUMBER env match first,
 * else the first ACTIVE/IDLE row, else the first row. Claim ownership
 * still guards it via the session-derived holder below.
 */
router.get("/primary", async (_req, res) => {
  try {
    const phones = await listTwentyAll<AgencyPhone>('agencyPhones');
    if (phones.length === 0) {
      res.status(404).json({ error: "No agency phone numbers in Twenty" });
      return;
    }
    const norm = (v: unknown) => String(v ?? "").replace(/[^\d+]/g, "");
    const want = norm(process.env.AGENCY_PHONE_NUMBER || "");
    const pick: AgencyPhone | undefined = want
      ? phones.find((p) => norm(p.phoneNumber || p.name) === want)
      : undefined;
    const resolved =
      pick ??
      phones.find((p) => (p.state || "ACTIVE") === "ACTIVE" && (p.callState || "IDLE") === "IDLE") ??
      phones.find((p) => (p.state || "ACTIVE") === "ACTIVE") ??
      phones[0];
    res.json({ phone: mapPhone(resolved), isPrimary: true, total: phones.length });
  } catch (err: any) {
    log.error("Failed to resolve primary phone:", err.message);
    res.status(500).json({ error: "Failed to resolve primary phone", details: err.message });
  }
});

/**
 * POST /api/twenty/phones/:id/claim
 * Claim a number for the live dialer session. Fails 409 when another active member holds it (non-stale).
 * Holder is the authenticated workspaceMember; a mismatched body memberId is rejected (403).
 */
router.post("/:id/claim", async (req: AuthRequest, res) => {
  const id = req.params.id as string;
  const holder0 = sessionHolder(req, res);
  if (!holder0) return;
  const memberId = holder0.id;
  const memberEmail = holder0.email;

  const unlock = await acquirePhoneLock(id);
  try {
    const phone = await getTwenty<AgencyPhone>('agencyPhones', id);
    const holder = phone.claimedByMemberId || null;
    const stale = isClaimStale(phone);

    // Refuse claim if held by another member and NOT stale
    if (holder && holder !== memberId && !stale) {
      log.info(`Claim refused: ${id} held by ${phone.claimedByEmail || holder}`);
      res.status(409).json({
        error: "Number is in use",
        heldBy: phone.claimedByEmail || holder,
        callState: phone.callState || "IDLE",
        claimedAt: phone.claimedAt || null,
        lastHeartbeatAt: phone.lastHeartbeatAt || null,
      });
      return;
    }

    const now = new Date().toISOString();
    const updated = await updateTwenty<AgencyPhone>('agencyPhones', id, {
      callState: phone.callState || "IDLE",
      claimedByMemberId: memberId,
      claimedByEmail: memberEmail || "",
      claimedAt: now,
      lastHeartbeatAt: now,
    }, await resolveActor(req));
    log.info(`Number claimed: ${id} by ${memberEmail || memberId} (stale override: ${stale})`);
    res.json(mapPhone(updated));
  } catch (err: any) {
    log.error("Failed to claim number:", err.message);
    res.status(500).json({ error: "Failed to claim number", details: err.message });
  } finally {
    unlock();
  }
});

/**
 * POST /api/twenty/phones/:id/heartbeat
 * Send 3-second heartbeat to refresh claim timestamp (holder only).
 */
router.post("/:id/heartbeat", async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const holder0 = sessionHolder(req, res);
    if (!holder0) return;
    const memberId = holder0.id;
    const phone = await getTwenty<AgencyPhone>('agencyPhones', id);
    const holder = phone.claimedByMemberId || null;
    const stale = isClaimStale(phone);

    if (!holder || (holder !== memberId && !stale)) {
      res.status(409).json({ error: "Claim lost or held by another member", heldBy: phone.claimedByEmail || holder });
      return;
    }

    const now = new Date().toISOString();
    const updated = await updateTwenty<AgencyPhone>('agencyPhones', id, {
      lastHeartbeatAt: now,
      claimedByMemberId: memberId, // Re-affirm claim if stale override
    });
    res.json(mapPhone(updated));
  } catch (err: any) {
    log.error("Failed to update heartbeat:", err.message);
    res.status(500).json({ error: "Failed to update heartbeat", details: err.message });
  }
});

/**
 * POST /api/twenty/phones/:id/state
 * Move callState (DIALING, ACTIVE, IDLE) for the current session (holder only).
 * Body: { state: "IDLE" | "DIALING" | "ACTIVE" }
 */
router.post("/:id/state", async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const holder0 = sessionHolder(req, res);
    if (!holder0) return;
    const memberId = holder0.id;
    const { state } = req.body as CallStateBody;
    if (!state || (state !== "IDLE" && state !== "DIALING" && state !== "ACTIVE")) {
      res.status(400).json({ error: "state (IDLE|DIALING|ACTIVE) is required" });
      return;
    }
    const phone = await getTwenty<AgencyPhone>('agencyPhones', id);
    const holder = phone.claimedByMemberId || null;
    const stale = isClaimStale(phone);

    if (holder && holder !== memberId && !stale) {
      res.status(409).json({ error: "Number is held by another member", heldBy: phone.claimedByEmail || holder });
      return;
    }

    const now = new Date().toISOString();
    const updated = await updateTwenty<AgencyPhone>('agencyPhones', id, {
      callState: state,
      lastHeartbeatAt: now,
    }, await resolveActor(req));
    res.json(mapPhone(updated));
  } catch (err: any) {
    log.error("Failed to set call state:", err.message);
    res.status(500).json({ error: "Failed to set call state", details: err.message });
  }
});

/**
 * POST /api/twenty/phones/:id/release
 * Release the number back to IDLE and clear ownership (holder only, unless force: true).
 * Body: { force?: boolean, callId?: string }
 */
router.post("/:id/release", async (req: AuthRequest, res) => {
  const id = req.params.id as string;
  const holder0 = sessionHolder(req, res);
  if (!holder0) return;
  const memberId = holder0.id;
  const { force, callId } = req.body as ReleaseBody;

  const unlock = await acquirePhoneLock(id);
  try {
    const phone = await getTwenty<AgencyPhone>('agencyPhones', id);
    const holder = phone.claimedByMemberId || null;
    const stale = isClaimStale(phone);

    if (holder && holder !== memberId && !force && !stale) {
      res.status(409).json({ error: "Number is held by another member", heldBy: phone.claimedByEmail || holder });
      return;
    }

    const updated = await updateTwenty<AgencyPhone>('agencyPhones', id, {
      callState: "IDLE",
      claimedByMemberId: "",
      claimedByEmail: "",
      claimedAt: null,
      lastHeartbeatAt: null,
      currentCallId: callId || phone.currentCallId || "",
    }, await resolveActor(req));
    log.info(`Number released: ${id} by ${memberId}${force ? " (forced)" : ""}${stale ? " (stale)" : ""}`);
    res.json(mapPhone(updated));
  } catch (err: any) {
    log.error("Failed to release number:", err.message);
    res.status(500).json({ error: "Failed to release number", details: err.message });
  } finally {
    unlock();
  }
});

export default router;
