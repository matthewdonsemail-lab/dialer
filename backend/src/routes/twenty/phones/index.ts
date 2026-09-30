import { Router } from "express";
import { authMiddleware, AuthRequest } from "../../../middleware/auth.js";
import { getTwenty, updateTwenty, listTwentyAll } from "../../../lib/twenty-client.js";
import { twentyGraphqlClient } from "../../../lib/twenty-graphql.js";
import { createLogger } from "../../../lib/logger.js";
import type { AgencyPhone, ClaimBody, CallStateBody, ReleaseBody, HeartbeatBody } from "./types.js";
import { mapPhone } from "./helpers/index.js";

const router = Router();
router.use(authMiddleware);

const log = createLogger('phones');

// In-memory mutex for atomic check-and-claim per phone ID (phone-pool PR).
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

/**
 * Stale-claim expiry (minutes, env-overridable).
 *
 * The claim lock lives on the Twenty row, and the only code that clears it
 * ran inside the app — so a closed tab left numbers held forever. A non-IDLE
 * claim older than this with no activity is treated as abandoned: a new
 * claim may take the number, and anyone may release it. Normal calls last
 * minutes, so the default (60) never touches a live conversation; it only
 * reaps the dead ones. Holder re-claims stay idempotent at any age.
 * Freshness uses the newest of claimedAt / lastHeartbeatAt (heartbeat PR).
 */
function staleAfterMinutes(): number {
  const raw = Number(process.env.CLAIM_STALE_AFTER_MINUTES ?? 60);
  return Number.isFinite(raw) && raw > 0 ? raw : 60;
}

function claimActivityMs(phone: AgencyPhone): number | null {
  const stamps = [phone.claimedAt, (phone as { lastHeartbeatAt?: string }).lastHeartbeatAt]
    .map((s) => (s ? new Date(s).getTime() : NaN))
    .filter((t) => Number.isFinite(t));
  if (stamps.length === 0) return null;
  return Math.max(...stamps);
}

function claimAgeMinutes(phone: AgencyPhone): number | null {
  const at = claimActivityMs(phone);
  if (at === null) return null;
  return (Date.now() - at) / 60_000;
}

function isClaimStale(phone: AgencyPhone): boolean {
  if ((phone.callState || "IDLE") === "IDLE") return false;
  const age = claimAgeMinutes(phone);
  // Non-IDLE with no usable timestamp predates claim tracking: ancient.
  if (age === null) return true;
  return age > staleAfterMinutes();
}

/** Normalize E.164-ish digits for primary-phone matching. */
function normPhone(raw: unknown): string {
  return String(raw ?? "").replace(/[^\d+]/g, "");
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
 * else the first ACTIVE/IDLE row, else the first row. The Softphone and
 * any automation default to this id; claim ownership still guards it.
 */
router.get("/primary", async (_req, res) => {
  try {
    const phones = await listTwentyAll<AgencyPhone>('agencyPhones');
    if (phones.length === 0) {
      res.status(404).json({ error: "No agency phone numbers in Twenty" });
      return;
    }
    const want = normPhone(process.env.AGENCY_PHONE_NUMBER || "");
    let pick: AgencyPhone | undefined;
    if (want) {
      pick = phones.find((p) => normPhone(p.phoneNumber || p.name) === want);
    }
    if (!pick) {
      pick =
        phones.find((p) => (p.state || "ACTIVE") === "ACTIVE" && (p.callState || "IDLE") === "IDLE") ??
        phones.find((p) => (p.state || "ACTIVE") === "ACTIVE") ??
        phones[0];
    }
    res.json({ phone: mapPhone(pick), isPrimary: true, total: phones.length });
  } catch (err: any) {
    log.error("Failed to resolve primary phone:", err.message);
    res.status(500).json({ error: "Failed to resolve primary phone", details: err.message });
  }
});

/**
 * POST /api/twenty/phones/:id/claim
 * Claim a number for the live dialer session. Fails 409 when another active member holds it (non-stale).
 * Body: { memberId, memberEmail }
 */
router.post("/:id/claim", async (req: AuthRequest, res) => {
  const id = req.params.id as string;
  const { memberId, memberEmail } = req.body as ClaimBody;
  if (!memberId) {
    res.status(400).json({ error: "memberId is required" });
    return;
  }

  const unlock = await acquirePhoneLock(id);
  try {
    const phone = await getTwenty<AgencyPhone>('agencyPhones', id);
    const holder = phone.claimedByMemberId || null;
    const stale = isClaimStale(phone);

    if (holder && holder !== memberId) {
      if (stale) {
        const age = claimAgeMinutes(phone);
        log.info(`Claim reaped: ${id} was held by ${phone.claimedByEmail || holder} (${age === null ? "no timestamp" : `${Math.round(age)}m old`}); taken by ${memberEmail || memberId}`);
      } else {
        log.info(`Claim refused: ${id} held by ${phone.claimedByEmail || holder}`);
        res.status(409).json({
          error: "Number is in use",
          heldBy: phone.claimedByEmail || holder,
          callState: phone.callState || "IDLE",
          claimedAt: phone.claimedAt || null,
          lastHeartbeatAt: (phone as { lastHeartbeatAt?: string }).lastHeartbeatAt || null,
        });
        return;
      }
    }

    const now = new Date().toISOString();
    const updated = await updateTwenty<AgencyPhone>('agencyPhones', id, {
      callState: phone.callState && phone.callState !== "IDLE" && holder === memberId ? phone.callState : "DIALING",
      claimedByMemberId: memberId,
      claimedByEmail: memberEmail || "",
      claimedAt: holder === memberId && phone.claimedAt ? phone.claimedAt : now,
      lastHeartbeatAt: now,
    });
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
 * Refresh claim timestamp (holder only; stale claims may be re-affirmed).
 * Body: { memberId }
 */
router.post("/:id/heartbeat", async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const { memberId } = req.body as HeartbeatBody;
    if (!memberId) {
      res.status(400).json({ error: "memberId is required" });
      return;
    }
    const phone = await getTwenty<AgencyPhone>('agencyPhones', id);
    const holder = phone.claimedByMemberId || null;
    const stale = isClaimStale(phone);

    if (holder && holder !== memberId && !stale) {
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
 * Move callState (IDLE, DIALING, ACTIVE) for the current session (holder only).
 * Body: { memberId, state: "IDLE" | "DIALING" | "ACTIVE" }
 */
router.post("/:id/state", async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const { memberId, state } = req.body as CallStateBody;
    if (!memberId || (state !== "IDLE" && state !== "DIALING" && state !== "ACTIVE")) {
      res.status(400).json({ error: "memberId and state (IDLE|DIALING|ACTIVE) are required" });
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
    });
    res.json(mapPhone(updated));
  } catch (err: any) {
    log.error("Failed to set call state:", err.message);
    res.status(500).json({ error: "Failed to set call state", details: err.message });
  }
});

/**
 * POST /api/twenty/phones/:id/release
 * Release the number back to IDLE and clear ownership (holder only, unless force: true or stale).
 * Body: { memberId, force?: boolean, callId?: string }
 */
router.post("/:id/release", async (req: AuthRequest, res) => {
  const id = req.params.id as string;
  const { memberId, force, callId } = req.body as ReleaseBody;
  if (!memberId) {
    res.status(400).json({ error: "memberId is required" });
    return;
  }

  const unlock = await acquirePhoneLock(id);
  try {
    const phone = await getTwenty<AgencyPhone>('agencyPhones', id);
    const holder = phone.claimedByMemberId || null;
    const stale = isClaimStale(phone);
    if (holder && holder !== memberId && !force) {
      if (stale) {
        const age = claimAgeMinutes(phone);
        log.info(`Stale claim reaped on release: ${id} was held by ${phone.claimedByEmail || holder} (${age === null ? "no timestamp" : `${Math.round(age)}m old`}); released by ${memberId}`);
      } else {
        res.status(409).json({ error: "Number is held by another member", heldBy: phone.claimedByEmail || holder });
        return;
      }
    }

    const updated = await updateTwenty<AgencyPhone>('agencyPhones', id, {
      callState: "IDLE",
      claimedByMemberId: "",
      claimedByEmail: "",
      claimedAt: null,
      lastHeartbeatAt: null,
      currentCallId: callId || phone.currentCallId || "",
    });
    log.info(`Number released: ${id} by ${memberId}${force ? " (forced)" : ""}`);
    res.json(mapPhone(updated));
  } catch (err: any) {
    log.error("Failed to release number:", err.message);
    res.status(500).json({ error: "Failed to release number", details: err.message });
  } finally {
    unlock();
  }
});

export default router;
