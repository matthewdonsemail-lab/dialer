import { test } from "node:test";
import assert from "node:assert/strict";
import { waitForSlot } from "./index.js";

test("a request goes out at once while the lane is under its limit", () => {
  assert.equal(waitForSlot([], 1000, 3), 0);
  assert.equal(waitForSlot([0, 10], 1000, 3), 0);
});

test("over the limit, it waits until enough older requests leave the window", () => {
  // Window 60s, limit 2, three sent at 0s, 10s, 20s: the one at 10s must age out (at 70s).
  assert.equal(waitForSlot([0, 10_000, 20_000], 30_000, 2), 40_005);
});

test("the background lane stops short of the full budget, so the live lane still has room", () => {
  const sent = Array.from({ length: 60 }, (_, i) => i * 100);
  assert.ok(waitForSlot(sent, 6_000, 60) > 0, "background (60) is full");
  assert.equal(waitForSlot(sent, 6_000, 90), 0, "live (90) still goes out");
});
