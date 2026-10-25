import { test } from "node:test";
import assert from "node:assert/strict";
import { startRingtone, stopRingtone, isRingtonePlaying } from "./ringtone";

test("ringtone starts and stops cleanly", () => {
  assert.equal(isRingtonePlaying(), false);
  const started = startRingtone({ volume: 0.2 });
  if (typeof window !== "undefined" && (window as any).AudioContext) {
    assert.equal(started, true);
    assert.equal(isRingtonePlaying(), true);
  }
  stopRingtone();
  assert.equal(isRingtonePlaying(), false);
});

test("multiple stop calls are safe and idempotent", () => {
  stopRingtone();
  stopRingtone();
  assert.equal(isRingtonePlaying(), false);
});
