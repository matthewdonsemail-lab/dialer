import type { AgencyPhone } from "../types.js";

/** AgencyPhone -> frontend shape. Pure. */
export function mapPhone(phone: AgencyPhone) {
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
    // Claim state — single holder at a time. Stale claims are NOT masked
    // here: the single canonical agency number must never silently appear
    // free while held. Stale reaping happens explicitly in claim/release
    // (see index.ts isClaimStale), never by hiding the holder.
    callState: phone.callState || "IDLE",
    claimedByMemberId: phone.claimedByMemberId || null,
    claimedByEmail: phone.claimedByEmail || null,
    claimedAt: phone.claimedAt || null,
    lastHeartbeatAt: (phone as { lastHeartbeatAt?: string }).lastHeartbeatAt || null,
    currentCallId: phone.currentCallId || null,
    // Back-compat aliases for existing UI (PhoneNumbersPage, widget selector)
    provider: phone.numberType || "Unknown",
    city: "—",
    country: phone.countryCode || "—",
    status: (phone.state || "active").toLowerCase(),
    created_at: phone.createdAt || new Date().toISOString(),
    updated_at: phone.updatedAt || new Date().toISOString(),
  };
}
