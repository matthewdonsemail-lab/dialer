import { test } from "node:test";
import assert from "node:assert/strict";
import { mapPerson, personPayload, phoneText } from "./helpers.js";

test("phones come back as E.164 whether or not the calling code has a plus", () => {
  assert.equal(phoneText({ primaryPhoneNumber: "15550148", primaryPhoneCallingCode: "353" }), "+35315550148");
  assert.equal(phoneText({ primaryPhoneNumber: "15550148", primaryPhoneCallingCode: "+353" }), "+35315550148");
  assert.equal(phoneText({ primaryPhoneNumber: "+15705550142" }), "+15705550142");
  assert.equal(phoneText({ primaryPhoneNumber: "" }), null);
});

test("a Twenty person maps to the frontend shape", () => {
  const p = mapPerson({
    id: "a",
    name: "John Lally",
    jobTitle: "Owner",
    personRole: "Owner",
    city: "Galway",
    phones: { primaryPhoneNumber: "15550148", primaryPhoneCallingCode: "353" },
    emails: { primaryEmail: "" },
    linkedinLink: { primaryLinkUrl: "linkedin.com/in/jl" },
    prospectId: "p",
  });
  assert.equal(p.phone, "+35315550148");
  assert.equal(p.email, null);
  assert.equal(p.linkedin, "https://linkedin.com/in/jl");
});

test("payload only writes the fields sent", () => {
  assert.deepEqual(personPayload({ name: " Ann ", role: "Manager" }), { name: "Ann", personRole: "Manager" });
  assert.equal((personPayload({ phone: "+353 1 555 0148" }).phones as { primaryPhoneNumber: string }).primaryPhoneNumber, "+35315550148");
});
