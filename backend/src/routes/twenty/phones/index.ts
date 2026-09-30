import { Router } from "express";
import { authMiddleware, AuthRequest } from "../../../middleware/auth.js";
import { getTwenty, updateTwenty } from "../../../lib/twenty-client.js";
import { twentyGraphqlClient } from "../../../lib/twenty-graphql.js";
import { createLogger } from "../../../lib/logger.js";
import type { AgencyPhone, ClaimBody, CallStateBody, ReleaseBody } from "./types.js";
import { mapPhone } from "./helpers/index.js";

const router = Router();
router.use(authMiddleware);

const log = createLogger('phones');

/**
 * Stale-claim expiry (minutes, env-overridable).
 *
 * The claim lock lives on the Twenty row, and the only code that clears it
 * ran inside the app — so a closed tab left numbers held forever. A non-IDLE
 * claim older than this with no activity is treated as abandoned: a new
 * claim may take the number, and anyone may release it. Normal calls last
 * minutes, so the default (60) never touches a live conversation; it only
 * reaps the dead ones. Holder re-claims stay idempotent at any age.
 */
function staleAfterMinutes(): number {
  const raw = Number(process.env.CLAIM_STALE_AFTER_MINUTES ?? 60);
  return Number.isFinite(raw) && raw > 0 ? raw : 60;
}

function claimAgeMinutes(phone: AgencyPhone): number | null {
  if (!phone.claimedAt) return null;
  const at = new Date(phone.claimedAt).getTime();
  if (!Number.isFinite(at)) return null;
  return (Date.now() - at) / 60_000;
}

function isClaimStale(phone: AgencyPhone): boolean {
  if ((phone.callState || "IDLE") === "IDLE") return false;
  const age = claimAgeMinutes(phone);
  // Non-IDLE with no usable timestamp predates claim tracking: ancient.
  if (age === null) return true;
  return age > staleAfterMinutes();
}

router.get("/", async (_req, res) => {
  try {
    log.info('Fetching phones from Twenty CRM');

    // Typed read via the generated client (packages/shared) — same rows
    // the REST list returned, verified field-for-field (see A/B notes in
    // docs/naming-conventions.md). Writes stay on the REST wrappers below.
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
            currentCallId: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });
    const phones: AgencyPhone[] = (result.agencyPhones?.edges ?? []).map((e) => e.node);

    log.info(`Found ${phones.length} phones`);

    res.json(phones.map(mapPhone));
  } catch (err: any) {
    log.error("Failed to fetch phones from Twenty:", err.message);
    res.status(500).json({ error: "Failed to fetch phone numbers from Twenty", details: err.message });
  }
});

/**
 * POST /api/twenty/phones/:id/claim
 * Claim a number for the live call. Fails 409 when another member holds it.
 * Body: { memberId, memberEmail }
 */
router.post("/:id/claim", async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const { memberId, memberEmail } = req.body as ClaimBody;
    if (!memberId) {
      res.status(400).json({ error: "memberId is required" });
      return;
    }
    const phone = await getTwenty<AgencyPhone>('agencyPhones', id);
    const state = phone.callState || "IDLE";
    const holder = phone.claimedByMemberId || null;
    if (state !== "IDLE" && holder && holder !== memberId) {
      if (isClaimStale(phone)) {
        const age = claimAgeMinutes(phone);
        log.info(`Claim reaped: ${id} was held by ${phone.claimedByEmail || holder} (${age === null ? "no timestamp" : `${Math.round(age)}m old`}); taken by ${memberEmail || memberId}`);
      } else {
        log.info(`Claim refused: ${id} held by ${phone.claimedByEmail || holder}`);
        res.status(409).json({
          error: "Number is in use",
          heldBy: phone.claimedByEmail || holder,
          callState: state,
          claimedAt: phone.claimedAt || null,
        });
        return;
      }
    }
    const now = new Date().toISOString();
    const updated = await updateTwenty<AgencyPhone>('agencyPhones', id, {
      callState: "DIALING",
      claimedByMemberId: memberId,
      claimedByEmail: memberEmail || "",
      claimedAt: now,
      lastSyncedAt: now,
    });
    log.info(`Number claimed: ${id} by ${memberEmail || memberId}`);
    res.json(mapPhone(updated));
  } catch (err: any) {
    log.error("Failed to claim number:", err.message);
    res.status(500).json({ error: "Failed to claim number", details: err.message });
  }
});

/**
 * POST /api/twenty/phones/:id/state
 * Move the live call DIALING -> ACTIVE (holder only).
 * Body: { memberId, state: "DIALING" | "ACTIVE" }
 */
router.post("/:id/state", async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const { memberId, state } = req.body as CallStateBody;
    if (!memberId || (state !== "DIALING" && state !== "ACTIVE")) {
      res.status(400).json({ error: "memberId and state (DIALING|ACTIVE) are required" });
      return;
    }
    const phone = await getTwenty<AgencyPhone>('agencyPhones', id);
    if ((phone.claimedByMemberId || null) !== memberId) {
      res.status(409).json({ error: "Number is held by another member", heldBy: phone.claimedByEmail || phone.claimedByMemberId || null });
      return;
    }
    const updated = await updateTwenty<AgencyPhone>('agencyPhones', id, {
      callState: state,
      lastSyncedAt: new Date().toISOString(),
    });
    res.json(mapPhone(updated));
  } catch (err: any) {
    log.error("Failed to set call state:", err.message);
    res.status(500).json({ error: "Failed to set call state", details: err.message });
  }
});

/**
 * POST /api/twenty/phones/:id/release
 * Release the number back to IDLE (holder only, unless force: true).
 * Body: { memberId, force?: boolean, callId?: string }
 */
router.post("/:id/release", async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const { memberId, force, callId } = req.body as ReleaseBody;
    if (!memberId) {
      res.status(400).json({ error: "memberId is required" });
      return;
    }
    const phone = await getTwenty<AgencyPhone>('agencyPhones', id);
    const holder = phone.claimedByMemberId || null;
    if (holder && holder !== memberId && !force) {
      if (isClaimStale(phone)) {
        const age = claimAgeMinutes(phone);
        log.info(`Stale claim reaped on release: ${id} was held by ${phone.claimedByEmail || holder} (${age === null ? "no timestamp" : `${Math.round(age)}m old`}); released by ${memberId}`);
      } else {
        res.status(409).json({ error: "Number is held by another member", heldBy: phone.claimedByEmail || holder });
        return;
      }
    }
    const now = new Date().toISOString();
    const updated = await updateTwenty<AgencyPhone>('agencyPhones', id, {
      callState: "IDLE",
      claimedByMemberId: "",
      claimedByEmail: "",
      claimedAt: null,
      currentCallId: callId || phone.currentCallId || "",
      lastSyncedAt: now,
    });
    log.info(`Number released: ${id} by ${memberId}${force ? " (forced)" : ""}`);
    res.json(mapPhone(updated));
  } catch (err: any) {
    log.error("Failed to release number:", err.message);
    res.status(500).json({ error: "Failed to release number", details: err.message });
  }
});

export default router;
