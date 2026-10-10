import { test } from "node:test";
import assert from "node:assert/strict";
import { additionalEmails, additionalPhones } from "./index.js";

test("formats additional phones from Twenty's composite and drops the primary", () => {
  const phone = {
    primaryPhoneNumber: "+15705550100",
    additionalPhones: [
      { number: "5705550101", callingCode: "+1", countryCode: "US" },
      { number: "+353861234567" },
      { number: "5705550100", callingCode: "1" }, // same as primary
      { number: "" },
      "+447700900123",
    ],
  };
  assert.deepEqual(additionalPhones(phone, "+15705550100"), ["+15705550101", "+353861234567", "+447700900123"]);
});

test("returns no additional phones for strings, nulls and missing lists", () => {
  assert.deepEqual(additionalPhones("+15705550100"), []);
  assert.deepEqual(additionalPhones(null), []);
  assert.deepEqual(additionalPhones({ primaryPhoneNumber: "+1" }), []);
});

test("returns additional emails without the primary, case-insensitively", () => {
  const email = { primaryEmail: "Jane@Example.com", additionalEmails: ["jane@example.com", "jane.work@example.com", " ", 7] };
  assert.deepEqual(additionalEmails(email, "Jane@Example.com"), ["jane.work@example.com"]);
  assert.deepEqual(additionalEmails("jane@example.com"), []);
});
