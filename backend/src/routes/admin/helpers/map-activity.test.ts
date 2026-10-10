import { test } from "node:test";
import assert from "node:assert/strict";
import { compactValue, mapActivity } from "./map-activity.js";

test("composite values stay structured instead of becoming cut-off JSON", () => {
  const phones = { primaryPhoneNumber: "5702355822", primaryPhoneCallingCode: "+1", additionalPhones: [] };
  assert.deepEqual(compactValue(phones), phones);
  assert.deepEqual(compactValue({ palette: ["#0693e3", "#f78da7"], primary: "#0693e3" }), { palette: ["#0693e3", "#f78da7"], primary: "#0693e3" });
});

test("long text keeps enough for a notes entry; lists and nesting are bounded", () => {
  assert.equal(compactValue("x".repeat(500)), "x".repeat(500));
  assert.equal((compactValue("x".repeat(5000)) as string).length, 2000);
  assert.equal((compactValue(Array.from({ length: 50 }, (_, i) => i)) as unknown[]).length, 10);
  assert.deepEqual(compactValue({ a: { b: { c: { d: 1 } } } }), { a: { b: { c: null } } });
});

test("mapActivity carries structured before/after", () => {
  const event = mapActivity(
    {
      id: "e1",
      happensAt: "2026-10-10T09:00:00Z",
      name: "agencyProspect.updated",
      targetAgencyProspectId: "p1",
      createdBy: { name: "Admin User", source: "API" },
      properties: { diff: { brandColors: { before: null, after: { primary: "#0693e3" } } } },
    },
    {},
  );
  assert.deepEqual(event?.changes, [{ field: "brandColors", before: null, after: { primary: "#0693e3" } }]);
  assert.equal(event?.actor.source, "API");
});
