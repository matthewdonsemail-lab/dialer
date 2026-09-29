export interface AgencyPhone {
  id: string;
  name?: string;
  phoneNumber?: string;
  countryCode?: string;
  numberType?: string;
  state?: string;
  messagingProfileId?: string;
  tenDlcCampaignId?: string;
  tollFreeVerificationId?: string;
  lastSyncedAt?: string;
  eligibleProducts?: unknown;
  features?: unknown;
  health?: unknown;
  // Claim state (who holds the number for the live call)
  callState?: string;
  claimedByMemberId?: string;
  claimedByEmail?: string;
  claimedAt?: string;
  currentCallId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ClaimBody {
  memberId?: string;
  memberEmail?: string;
}

export interface CallStateBody {
  memberId?: string;
  state?: string;
}

export interface ReleaseBody {
  memberId?: string;
  force?: boolean;
  callId?: string;
}
