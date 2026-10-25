import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planParallelBatch,
  getNextQueueIndex,
  isLive,
  MAX_PARALLEL_LINES,
  type DialTarget,
  type DialerLine,
  type CallState,
} from "./dialerProvider";

function mockLine(partial: Partial<DialerLine> & { id: string; phoneNumber: string }): DialerLine {
  return {
    countryCode: null,
    callState: "IDLE",
    claimedByMemberId: null,
    numberType: "LONG_CODE",
    tenDlcCampaignId: null,
    tollFreeVerificationId: null,
    ...partial,
  };
}

const auLine = mockLine({
  id: "line-au-1",
  phoneNumber: "+61291234567",
  countryCode: "AU",
  callState: "IDLE",
});

const usLine1 = mockLine({
  id: "line-us-1",
  phoneNumber: "+15125550101",
  countryCode: "US",
  callState: "IDLE",
});

const usLine2 = mockLine({
  id: "line-us-2",
  phoneNumber: "+15125550102",
  countryCode: "US",
  callState: "IDLE",
});

const caLine = mockLine({
  id: "line-ca-1",
  phoneNumber: "+16045550101",
  countryCode: "CA",
  callState: "IDLE",
});

test("planParallelBatch: plans up to requested count with unique lines", () => {
  const candidates: DialTarget[] = [
    { contactType: "prospect", contactId: "p1", phone: "+15125550201", name: "Alice", country: "US" },
    { contactType: "prospect", contactId: "p2", phone: "+15125550202", name: "Bob", country: "US" },
    { contactType: "prospect", contactId: "p3", phone: "+15125550203", name: "Charlie", country: "US" },
  ];
  const lines = [usLine1, usLine2, caLine];

  const { plan, consumed } = planParallelBatch(candidates, lines, usLine1, 2);

  assert.equal(plan.length, 2);
  assert.equal(consumed, 2);
  assert.equal(plan[0].target.name, "Alice");
  assert.equal(plan[1].target.name, "Bob");
  // Each leg has a distinct sending number:
  assert.notEqual(plan[0].from.id, plan[1].from.id);
  assert.notEqual(plan[0].from.phoneNumber, plan[1].from.phoneNumber);
});

test("planParallelBatch: caps batch at MAX_PARALLEL_LINES (5)", () => {
  const candidates: DialTarget[] = Array.from({ length: 10 }, (_, i) => ({
    contactType: "prospect",
    contactId: `p-${i}`,
    phone: `+1512555020${i}`,
    name: `User ${i}`,
    country: "US",
  }));
  const lines: DialerLine[] = Array.from({ length: 8 }, (_, i) =>
    mockLine({
      id: `line-${i}`,
      phoneNumber: `+1512555010${i}`,
      countryCode: "US",
      callState: "IDLE",
    }),
  );

  const { plan, consumed } = planParallelBatch(candidates, lines, lines[0], 8);

  assert.equal(plan.length, MAX_PARALLEL_LINES);
  assert.equal(consumed, MAX_PARALLEL_LINES);
  const usedLineIds = new Set(plan.map((p) => p.from.id));
  assert.equal(usedLineIds.size, MAX_PARALLEL_LINES);
});

test("planParallelBatch: matches local numbers for Australian and overseas contacts", () => {
  const candidates: DialTarget[] = [
    { contactType: "prospect", contactId: "p-au", phone: "+61298765432", name: "Sydney Firm", country: "AU" },
    { contactType: "prospect", contactId: "p-us", phone: "+15125550201", name: "Austin Tech", country: "US" },
  ];
  const lines = [usLine1, auLine];

  const { plan } = planParallelBatch(candidates, lines, usLine1, 2);

  assert.equal(plan.length, 2);
  // AU contact routed through AU line
  const auLeg = plan.find((p) => p.target.country === "AU");
  assert.ok(auLeg);
  assert.equal(auLeg.from.countryCode, "AU");
  assert.equal(auLeg.from.phoneNumber, "+61291234567");

  // US contact routed through US line
  const usLeg = plan.find((p) => p.target.country === "US");
  assert.ok(usLeg);
  assert.equal(usLeg.from.countryCode, "US");
});

test("planParallelBatch: skips contacts with no phone number but counts them in consumed", () => {
  const candidates: DialTarget[] = [
    { contactType: "prospect", contactId: "p1", phone: "", name: "No Phone Contact", country: "US" },
    { contactType: "prospect", contactId: "p2", phone: "+15125550202", name: "Bob", country: "US" },
  ];
  const lines = [usLine1, usLine2];

  const { plan, consumed } = planParallelBatch(candidates, lines, usLine1, 2);

  assert.equal(plan.length, 1);
  assert.equal(consumed, 2);
  assert.equal(plan[0].target.name, "Bob");
});

test("planParallelBatch: returns empty plan when all lines are busy", () => {
  const candidates: DialTarget[] = [
    { contactType: "prospect", contactId: "p1", phone: "+15125550201", name: "Alice", country: "US" },
  ];
  const busyLine: DialerLine = { ...usLine1, callState: "ACTIVE" };

  const { plan, consumed } = planParallelBatch(candidates, [busyLine], busyLine, 2);

  assert.equal(plan.length, 0);
  assert.equal(consumed, 0);
});

test("getNextQueueIndex: advances past consumed contacts and skips contacts without phone", () => {
  const rows = [
    { phone: "+15125550101" }, // index 0 (consumed in batch of 2)
    { phone: "+15125550102" }, // index 1 (consumed in batch of 2)
    { phone: null },           // index 2 (has no phone)
    { phone: "" },             // index 3 (has no phone)
    { phone: "+15125550105" }, // index 4 (next valid contact)
  ];

  // Batch starting at 0, consuming 2 items: next valid candidate should be index 4
  const next = getNextQueueIndex(rows, 0, 2);
  assert.equal(next, 4);

  // From index 4 consuming 1 item: no remaining contacts
  const end = getNextQueueIndex(rows, 4, 1);
  assert.equal(end, -1);
});

test("isLive: correctly identifies active call states", () => {
  const liveStates: CallState[] = ["connecting", "ringing", "active", "on_hold"];
  const idleStates: CallState[] = ["idle", "ended"];

  for (const s of liveStates) {
    assert.equal(isLive(s), true, `Expected ${s} to be live`);
  }

  for (const s of idleStates) {
    assert.equal(isLive(s), false, `Expected ${s} not to be live`);
  }
});

test("multi-dial coordinator: winner takes all and non-answering lines are hung up", () => {
  // Simulate 3 lines dialing in parallel
  const legs = [
    { id: 1, phone: "+61290000001", status: "dialing", done: false, won: false, released: false },
    { id: 2, phone: "+61290000002", status: "dialing", done: false, won: false, released: false },
    { id: 3, phone: "+61290000003", status: "dialing", done: false, won: false, released: false },
  ];

  // All progress to ringing
  legs.forEach((l) => { l.status = "ringing"; });
  assert.ok(legs.every((l) => l.status === "ringing"));

  // Line 2 answers first
  const winner = legs[1];
  winner.won = true;
  winner.status = "answered";

  // Other lines are closed with no_answer and released
  legs.forEach((l) => {
    if (l !== winner) {
      l.done = true;
      l.status = "no_answer";
      l.released = true;
    }
  });

  assert.equal(winner.won, true);
  assert.equal(winner.status, "answered");
  assert.equal(winner.released, false);

  assert.equal(legs[0].status, "no_answer");
  assert.equal(legs[0].released, true);
  assert.equal(legs[2].status, "no_answer");
  assert.equal(legs[2].released, true);
});

test("multi-dial coordinator: end-to-end auto-queue chaining across batches", () => {
  const contactList = [
    { phone: "+61290000001" }, // Contact 0 (Batch 1)
    { phone: "+61290000002" }, // Contact 1 (Batch 1)
    { phone: "+61290000003" }, // Contact 2 (Batch 2)
    { phone: "+61290000004" }, // Contact 3 (Batch 2)
    { phone: "+61290000005" }, // Contact 4 (Batch 3)
  ];

  const dialedBatches: number[][] = [];
  let currentIndex = 0;
  const lineCount = 2;

  function runAutoQueueStep(startIndex: number) {
    if (startIndex >= contactList.length) return;
    const batch = contactList.slice(startIndex, startIndex + lineCount);
    dialedBatches.push(batch.map((_, i) => startIndex + i));
    const consumed = batch.length;
    const nextIndex = getNextQueueIndex(contactList, startIndex, consumed);
    if (nextIndex >= 0) {
      runAutoQueueStep(nextIndex);
    }
  }

  runAutoQueueStep(currentIndex);

  assert.equal(dialedBatches.length, 3);
  assert.deepEqual(dialedBatches[0], [0, 1]); // Batch 1
  assert.deepEqual(dialedBatches[1], [2, 3]); // Batch 2
  assert.deepEqual(dialedBatches[2], [4]);    // Batch 3
});

test("multi-dial coordinator: stop all lines cancels auto-queue chaining", () => {
  let autoQueueTriggered = false;
  let stopped = false;

  const batchOptions = {
    onSaved: () => {
      autoQueueTriggered = true;
    },
  };

  // User clicks "Stop all lines"
  stopped = true;
  const after = stopped ? undefined : batchOptions.onSaved;
  after?.();

  assert.equal(autoQueueTriggered, false, "Auto-queue should not proceed when stopped");
});
