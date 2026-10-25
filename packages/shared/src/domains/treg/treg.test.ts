import { test } from "node:test";
import assert from "node:assert/strict";
import { AUSTRALIAN_BUSINESS_FIXTURES } from "./fixtures/australianBusinesses.js";
import { mapTregToProspect } from "./helpers/mapTregToProspect.js";

test("AU fixtures contain valid Australian business records", () => {
  assert.equal(AUSTRALIAN_BUSINESS_FIXTURES.length > 0, true);
  for (const b of AUSTRALIAN_BUSINESS_FIXTURES) {
    assert.equal(b.country, "AU");
    assert.match(b.phone ?? "", /^\+61/);
  }
});

test("mapTregToProspect normalizes Australian numbers and sets Twenty prospect fields", () => {
  const sample = AUSTRALIAN_BUSINESS_FIXTURES[0]!;
  const prospect = mapTregToProspect(sample);

  assert.equal(prospect.name, sample.name);
  assert.equal(prospect.company, sample.name);
  assert.equal(prospect.country, "AU");
  assert.equal(prospect.leadSource, "TREG");
  assert.match(prospect.phone, /^\+61292345678$/);
  assert.ok(prospect.lastTregAt);
  assert.equal(prospect.coldCallStatus, "NEW");
});

test("mapTregToProspect converts domestic 02 landline to +612 E.164", () => {
  const prospect = mapTregToProspect({
    externalId: "test_01",
    name: "Sydney Test Shop",
    phone: "02 9876 5432",
    country: "AU",
    city: "Sydney",
  });
  assert.equal(prospect.phone, "+61298765432");
  assert.equal(prospect.country, "AU");
});
