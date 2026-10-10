import { test } from "node:test";
import assert from "node:assert/strict";
import { campaignProgress, campaignStats, clock, nextContactId, type CampaignCall } from "./campaignStats";
import type { CallCampaign } from "@/domains/api/client";

const campaign: CallCampaign = {
  id: "c1", name: "2023-10-23 22:44", status: "active",
  contactIds: ["p1", "p2", "p3", "p4"], createdByName: null, createdAt: "2026-10-10T10:00:00Z",
};
const call = (over: Partial<CampaignCall>): CampaignCall => ({
  id: Math.random().toString(36), direction: "OUTBOUND", status: "GOOD_NUMBER", fromNumber: null,
  toNumber: "+1555", durationSeconds: 60, startedAt: "2026-10-10T11:00:00Z", created_at: "2026-10-10T11:00:00Z",
  createdBy: null, agencyProspectId: "p1", ...over,
});

const calls = [
  call({ agencyProspectId: "p1", status: "GOOD_NUMBER", durationSeconds: 1 }),
  call({ agencyProspectId: "p3", status: "NO_ANSWER", durationSeconds: 19 }),
  call({ agencyProspectId: "p2", startedAt: "2026-10-09T11:00:00Z", created_at: "2026-10-09T11:00:00Z" }), // before the campaign
  call({ agencyProspectId: "p9" }), // not in the campaign
];

test("progress counts each contact dialed since the campaign started", () => {
  const p = campaignProgress(campaign, calls);
  assert.deepEqual([p.total, p.dialed, p.remaining], [4, 2, 2]);
  assert.deepEqual(p.remainingIds, ["p2", "p4"]);
});

test("next contact moves forward past the current one and wraps", () => {
  assert.equal(nextContactId(campaign, calls), "p2");
  assert.equal(nextContactId(campaign, calls, "p2"), "p4");
  assert.equal(nextContactId(campaign, calls, "p4"), "p2");
  assert.equal(nextContactId({ ...campaign, contactIds: ["p1"] }, calls, "p1"), null);
});

test("statistics match WAVV's campaign card", () => {
  const s = campaignStats(campaign, calls);
  assert.equal(s.callsMade, 2);
  assert.equal(s.connectionRate, 0.5);
  assert.equal(clock(s.dialSeconds), "0:20");
  assert.equal(clock(s.talkSeconds), "0:01");
  assert.equal(clock(s.avgCallSeconds), "0:01");
  assert.deepEqual(s.dispositions.map((d) => d.label).sort(), ["Good Number", "No Answer"]);
});
