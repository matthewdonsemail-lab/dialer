import { test } from "node:test";
import assert from "node:assert/strict";
import { pickCallLine } from "./callRoute";

const us = { id: "us", phoneNumber: "+15125550100", countryCode: "US", callState: "IDLE" };
const ca = { id: "ca", phoneNumber: "+16045550100", countryCode: "CA", callState: "IDLE" };
const ie = { id: "ie", phoneNumber: "+35315550100", countryCode: "IE", callState: "IDLE" };

test("a contact in the line's country keeps the selected line", () => {
  const r = pickCallLine([us, ie], us, { number: "+15125550123", country: "United States" });
  assert.equal(r.line?.id, "us");
  assert.equal(r.switched, false);
  assert.equal(r.abroad, false);
});

test("a Canadian contact is not local to a US number, even on +1", () => {
  assert.equal(pickCallLine([us], us, { number: "+16045550123", country: "CA" }).abroad, true);
  const r = pickCallLine([us, ca], us, { number: "+16045550123", country: "Canada" });
  assert.equal(r.line?.id, "ca");
  assert.equal(r.switched, true);
});

test("a contact abroad switches to a free line in their country", () => {
  const r = pickCallLine([us, ie], us, { number: "+35315550148", country: "IE" });
  assert.equal(r.line?.id, "ie");
  assert.equal(r.switched, true);
});

test("with no local line the call is marked international", () => {
  const r = pickCallLine([us, { ...ie, callState: "ACTIVE" }], us, { number: "+35315550148" });
  assert.equal(r.line?.id, "us");
  assert.equal(r.abroad, true);
});

test("an unknown country or region never blocks the call", () => {
  assert.equal(pickCallLine([us], us, { number: "0871234567" }).abroad, false);
  assert.equal(pickCallLine([us], us, { number: "+15125550123" }).abroad, false);
});
