import { test } from "node:test";
import assert from "node:assert/strict";
import { countSms } from "./sms";

test("empty text is zero segments", () => {
  assert.deepEqual(countSms(""), { encoding: "GSM-7", units: 0, segments: 0, remaining: 160 });
});

test("GSM-7 fits 160 in one part, then 153 per part", () => {
  assert.equal(countSms("a".repeat(160)).segments, 1);
  assert.equal(countSms("a".repeat(161)).segments, 2);
  assert.equal(countSms("a".repeat(306)).segments, 2);
  assert.equal(countSms("a".repeat(307)).segments, 3);
});

test("extension characters count twice", () => {
  assert.equal(countSms("€").units, 2);
  assert.equal(countSms("a".repeat(159) + "€").segments, 2);
});

test("anything outside GSM-7 switches to UCS-2: 70, then 67 per part", () => {
  const c = countSms("Thanks ’ for calling");
  assert.equal(c.encoding, "UCS-2");
  assert.equal(countSms("ç".repeat(71)).segments, 2); // lower-case c-cedilla is not GSM-7
  assert.equal(countSms("中".repeat(70)).segments, 1);
  assert.equal(countSms("中".repeat(71)).segments, 2);
});
