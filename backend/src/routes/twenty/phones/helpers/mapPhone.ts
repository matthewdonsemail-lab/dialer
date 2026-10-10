import type { AgencyPhone } from "../types.js";

// A claim with no heartbeat for this long is free to take over. Heartbeats
// come every 10s, so three missed in a row free the number.
export const STALE_TIMEOUT_MS = 45_000;

/** A claim is stale when neither a heartbeat nor the claim itself is fresh. Pure. */
export function isClaimStale(phone: AgencyPhone): boolean {
  const lastBeat = phone.lastHeartbeatAt || phone.claimedAt;
  if (!lastBeat) return true;
  const time = new Date(lastBeat).getTime();
  if (isNaN(time)) return true;
  return Date.now() - time > STALE_TIMEOUT_MS;
}

/** AgencyPhone -> frontend shape. Pure. */
export function mapPhone(phone: AgencyPhone) {
  // Stale claims mask as IDLE with no holder: ownership is independent of
  // callState, so a second agent can take over a dead holder's number.
  const stale = isClaimStale(phone);
  const activeClaimant = !stale && phone.claimedByMemberId ? phone.claimedByMemberId : null;
  const activeEmail = !stale && phone.claimedByEmail ? phone.claimedByEmail : null;
  const effectiveCallState = !stale && phone.callState ? phone.callState : "IDLE";
  return {
    id: phone.id,
    name: phone.name,
    phoneNumber: phone.phoneNumber || phone.name || "—",
    // Live Twenty shape (see SendWebsiteWidget_plan.md §1.4)
    countryCode: phone.countryCode || null,
    numberType: phone.numberType || null,
    state: phone.state || null,
    messagingProfileId: phone.messagingProfileId || null,
    tenDlcCampaignId: phone.tenDlcCampaignId || null,
    tollFreeVerificationId: phone.tollFreeVerificationId || null,
    lastSyncedAt: phone.lastSyncedAt || null,
    eligibleProducts: phone.eligibleProducts ?? null,
    features: phone.features ?? null,
    health: phone.health ?? null,
    // Claim state — single holder at a time (stale claims show as IDLE)
    callState: effectiveCallState,
    claimedByMemberId: activeClaimant,
    claimedByEmail: activeEmail,
    claimedAt: !stale ? (phone.claimedAt || null) : null,
    lastHeartbeatAt: !stale ? (phone.lastHeartbeatAt || null) : null,
    currentCallId: phone.currentCallId || null,
    isStale: stale && !!phone.claimedByMemberId,
    // Back-compat aliases for existing UI (PhoneNumbersPage, widget selector)
    provider: phone.numberType || "Unknown",
    city: "—",
    country: phone.countryCode || "—",
    status: (phone.state || "active").toLowerCase(),
    created_at: phone.createdAt || new Date().toISOString(),
    updated_at: phone.updatedAt || new Date().toISOString(),
  };
}
