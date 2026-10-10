import { test } from "node:test";
import assert from "node:assert/strict";
import {
  callResultMachine,
  checkSmsRoute,
  contactStatusMachine,
  onPageSent,
  outreachMachine,
  regionOfNumber,
  toE164,
  toContactStatus,
  videoMachine,
  type Machine,
} from "./index.js";

test("every declared next state exists, for every machine", () => {
  const machines = [contactStatusMachine, outreachMachine, videoMachine, callResultMachine] as unknown as Machine<string>[];
  for (const m of machines) {
    for (const s of m.states) for (const n of m.def(s).next) assert.ok(m.isState(n), `${m.field}: ${s} -> ${n}`);
  }
});

test("contact status: ordinary moves, refusals that explain, and reopening Do not contact", () => {
  assert.deepEqual(contactStatusMachine.transition("NEW", "CALLBACK"), { ok: true, from: "NEW", to: "CALLBACK", changed: true });
  assert.equal(contactStatusMachine.transition(null, "contacted").ok, true); // blank is New; lower case accepted
  const stuck = contactStatusMachine.transition("DO_NOT_CONTACT", "CONTACTED");
  assert.equal(stuck.ok, false);
  assert.match(stuck.ok ? "" : stuck.reason, /final/);
  assert.equal(contactStatusMachine.transition("DO_NOT_CONTACT", "NEW").ok, false);
  assert.equal(contactStatusMachine.transition("DO_NOT_CONTACT", "NEW", { override: true }).ok, true);
  assert.equal(contactStatusMachine.transition("CONVERTED", "CALLBACK").ok, false);
  assert.equal(contactStatusMachine.transition("NEW", "BOGUS").ok, false);
  assert.equal(contactStatusMachine.label("NOT_INTERESTED"), "Not interested");
});

test("legacy values map onto the one vocabulary", () => {
  assert.equal(toContactStatus("not_interested"), "NOT_INTERESTED");
  assert.equal(toContactStatus("call_back"), "CALLBACK");
  assert.equal(toContactStatus("do_not_contact"), "DO_NOT_CONTACT");
  assert.equal(toContactStatus(""), "NEW");
  assert.equal(toContactStatus("nonsense"), null);
});

test("sending the page moves outreach forward, never out of an opt-out", () => {
  assert.deepEqual(onPageSent(null), { ok: true, to: "SMS_IN_PROGRESS", changed: true });
  assert.deepEqual(onPageSent("READY_FOR_SMS"), { ok: true, to: "SMS_IN_PROGRESS", changed: true });
  assert.deepEqual(onPageSent("SMS_IN_PROGRESS"), { ok: true, to: "SMS_IN_PROGRESS", changed: false });
  assert.deepEqual(onPageSent("POSITIVE_REPLY"), { ok: true, to: "POSITIVE_REPLY", changed: false });
  assert.equal(onPageSent("DO_NOT_CONTACT").ok, false);
  assert.equal(onPageSent("NEGATIVE_REPLY").ok, false);
});

test("SMS only goes within one numbering region", () => {
  assert.equal(regionOfNumber("+353 1 555 0148"), "IE");
  assert.equal(regionOfNumber("+12724470148"), "NANP");
  assert.equal(regionOfNumber("0871234567"), null);
  const usToIe = checkSmsRoute({ number: "+12724470148" }, { number: "+35315550148" });
  assert.equal(usToIe.ok, false);
  assert.match(usToIe.ok ? "" : usToIe.reason, /US \/ Canada number cannot text Irish numbers/);
  assert.equal(checkSmsRoute({ number: "+12724470148" }, { number: "+15705550142" }).ok, true);
  assert.equal(checkSmsRoute({ country: "IE" }, { number: "+35315550148" }).ok, true);
  const unknown = checkSmsRoute({ number: "+12724470148" }, { number: "0871234567" });
  assert.equal(unknown.ok && !!unknown.warning, true);
});

test("a finished call never reopens", () => {
  assert.equal(callResultMachine.transition("COMPLETED", "IN_PROGRESS").ok, false);
  assert.equal(callResultMachine.transition("IN_PROGRESS", "NO_ANSWER").ok, true);
});

test("phones become dialable E.164 and refusals read correctly", () => {
  assert.equal(toE164({ primaryPhoneNumber: "15550148", primaryPhoneCallingCode: "353" }), "+35315550148");
  assert.equal(toE164({ primaryPhoneNumber: "01 555 0148", primaryPhoneCallingCode: "+353" }), "+35315550148");
  assert.equal(toE164({ primaryPhoneNumber: "+15705550142" }), "+15705550142");
  assert.equal(toE164("+353 1 555 0148"), "+35315550148");
  assert.equal(toE164({ primaryPhoneNumber: "" }), null);
  const r = checkSmsRoute({ number: "+12724470148" }, { number: "+35315550148" });
  assert.match(r.ok ? "" : r.reason, /^A US \/ Canada number .* Send from an Irish number\.$/);
});
