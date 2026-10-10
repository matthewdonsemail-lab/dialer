import { test } from "node:test";
import assert from "node:assert/strict";
import { oldestFirst, pairKey, preview, telnyxSendResult, toMessageView } from "./messages.js";

test("a thread is keyed by our number then theirs", () => {
  assert.equal(pairKey("+15125550100", "+15125550123"), "+15125550100|+15125550123");
});

test("previews are one line and capped", () => {
  assert.equal(preview("Hi there,\n  this is Alex"), "Hi there, this is Alex");
  assert.equal(preview("x".repeat(100), 10).length, 10);
});

test("Telnyx send responses map to a stored status", () => {
  assert.deepEqual(telnyxSendResult({ data: { id: "m1", parts: 2, to: [{ status: "queued" }] } }), { id: "m1", status: "queued", parts: 2 });
  assert.deepEqual(telnyxSendResult({}), { id: null, status: "queued", parts: null });
});

test("rows read as chat bubbles, oldest first", () => {
  const rows = [
    toMessageView({ id: "b", direction: "inbound", body: "Yes please", createdAt: "2026-10-10T10:05:00Z", status: "received" }),
    toMessageView({ id: "a", direction: "OUTBOUND", body: "Want a preview?", createdAt: "2026-10-10T10:00:00Z", status: "DELIVERED" }),
  ];
  const sorted = oldestFirst(rows);
  assert.deepEqual(sorted.map((m) => m.id), ["a", "b"]);
  assert.equal(sorted[1].direction, "INBOUND");
  assert.equal(sorted[0].status, "delivered");
});
