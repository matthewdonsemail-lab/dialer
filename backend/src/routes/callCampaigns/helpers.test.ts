import { test } from "node:test";
import assert from "node:assert/strict";
import { mapCampaign, parseContactIds } from "./helpers.js";

test("contact ids keep dial order, drop blanks and duplicates", () => {
  assert.deepEqual(parseContactIds(["b", "a", "b", " ", 3, "c"]), ["b", "a", "c"]);
  assert.deepEqual(parseContactIds('["x","y"]'), ["x", "y"]);
  assert.deepEqual(parseContactIds("not json"), []);
  assert.deepEqual(parseContactIds(null), []);
});

test("campaign records map to lower-case statuses with a safe default", () => {
  const base = { id: "1", name: "Boston Homes", contactIds: '["p1","p2"]', createdAt: "2026-10-10T10:00:00Z" };
  assert.equal(mapCampaign({ ...base, status: "COMPLETED" }).status, "completed");
  assert.equal(mapCampaign({ ...base, status: "weird" }).status, "active");
  assert.deepEqual(mapCampaign({ ...base, status: "ARCHIVED" }).contactIds, ["p1", "p2"]);
});
