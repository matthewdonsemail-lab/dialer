import { test } from "node:test";
import assert from "node:assert/strict";
import { pickCallLine } from "./callRoute";

const us = { id: "us", phoneNumber: "+15125550100", countryCode: "US", callState: "IDLE" };
const ie = { id: "ie", phoneNumber: "+35315550100", countryCode: "IE", callState: "IDLE" };

test("a contact in the line's country keeps the selected line", () => {
  const r = pickCallLine([us, ie], us, { number: "+15125550123" });
  assert.equal(r.line?.id, "us");
  assert.equal(r.switched, false);
  assert.equal(r.abroad, false);
});

test("a contact abroad switches to a free line in their country", () => {
  const r = pickCallLine([us, ie], us, { number: "+35315550148" });
  assert.equal(r.line?.id, "ie");
  assert.equal(r.switched, true);
});

test("with no local line the call is marked international", () => {
  const r = pickCallLine([us, { ...ie, callState: "ACTIVE" }], us, { number: "+35315550148" });
  assert.equal(r.line?.id, "us");
  assert.equal(r.abroad, true);
  assert.equal(r.to, "IE");
});

test("an unknown region never blocks the call", () => {
  const r = pickCallLine([us], us, { number: "0871234567" });
  assert.equal(r.abroad, false);
});
