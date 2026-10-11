import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BOOST_MIN_RING_SECONDS,
  DEFAULT_DIALING_MODE,
  effectiveRingSeconds,
  machineResult,
  parseDialingMode,
  planFor,
  shouldAutoWrapEnd,
} from "./dialingModes";

test("Standard stops after every call, including unanswered ones", () => {
  const p = planFor("standard");
  assert.deepEqual(p, { screenAnswers: false, autoWrapUnanswered: false, autoWrapMachines: false });
});

test("Advanced skips unanswered calls on its own but still stops for a voicemail", () => {
  const p = planFor("advanced");
  assert.equal(p.autoWrapUnanswered, true);
  assert.equal(p.autoWrapMachines, false);
  assert.equal(p.screenAnswers, false);
});

test("Answer Boost screens answers and skips machines and unanswered calls", () => {
  const p = planFor("boost");
  assert.deepEqual(p, { screenAnswers: true, autoWrapUnanswered: true, autoWrapMachines: true });
});

test("only Answer Boost listens to who answers", () => {
  assert.equal(planFor("standard").screenAnswers, false);
  assert.equal(planFor("advanced").screenAnswers, false);
  assert.equal(planFor("boost").screenAnswers, true);
});

test("Answer Boost rings for at least 35 seconds; other modes keep the saved time", () => {
  assert.equal(effectiveRingSeconds("boost", 20), BOOST_MIN_RING_SECONDS);
  assert.equal(effectiveRingSeconds("boost", 50), 50);
  assert.equal(effectiveRingSeconds("standard", 20), 20);
  assert.equal(effectiveRingSeconds("advanced", 30), 30);
});

test("an unknown saved mode falls back to Standard", () => {
  assert.equal(parseDialingMode("boost"), "boost");
  assert.equal(parseDialingMode("turbo"), DEFAULT_DIALING_MODE);
  assert.equal(parseDialingMode(undefined), DEFAULT_DIALING_MODE);
});

test("a left voicemail is logged as Left Voicemail; a skipped machine as No answer, each with a note", () => {
  const left = machineResult({ left: true, seconds: 11.6 });
  assert.equal(left.outcome, "left_voicemail");
  assert.match(left.note, /left your recorded voicemail \(12s\)/);
  const skipped = machineResult({ left: false });
  assert.equal(skipped.outcome, "no_answer");
  assert.match(skipped.note, /skipped automatically/);
  assert.match(machineResult({ left: false, failed: true }).note, /could not be left/);
});

test("a call that ends with nobody on the line is skipped on its own only in Advanced and Answer Boost", () => {
  const rangOut = { unattended: true, humanConnected: false };
  assert.equal(shouldAutoWrapEnd(planFor("standard"), rangOut), false);
  assert.equal(shouldAutoWrapEnd(planFor("advanced"), rangOut), true);
  assert.equal(shouldAutoWrapEnd(planFor("boost"), rangOut), true);
  assert.equal(shouldAutoWrapEnd(undefined, rangOut), false, "an ordinary call has no plan");
});

test("a call a person was on, or one the operator ended, is never skipped on its own", () => {
  assert.equal(shouldAutoWrapEnd(planFor("boost"), { unattended: true, humanConnected: true }), false);
  assert.equal(shouldAutoWrapEnd(planFor("boost"), { unattended: false, humanConnected: false }), false);
});
