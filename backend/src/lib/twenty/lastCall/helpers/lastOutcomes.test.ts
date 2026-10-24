import { test } from "node:test";
import assert from "node:assert/strict";
import { lastOutcomes, outcomeCounts, sortByLastCall } from "./lastOutcomes.js";

test("the newest call per contact decides its last outcome", () => {
  const last = lastOutcomes([
    { agencyProspectId: "a", disposition: "INTERESTED", status: "COMPLETED" },
    { agencyProspectId: "a", disposition: "NO_ANSWER" },
    { agencyLeadId: "b", status: "NO_ANSWER" },
    { agencyProspectId: null, agencyLeadId: null, status: "FAILED" },
  ]);
  assert.deepEqual([...last.entries()], [["a", "INTERESTED"], ["b", "NO_ANSWER"]]);
  assert.deepEqual(outcomeCounts(last), { INTERESTED: 1, NO_ANSWER: 1 });
});

test("contacts sort by their last call, newest or oldest first, never-called last", () => {
  const newestFirst = ["c", "a", "co"]; // c called most recently, then a, then the company co
  const items = [{ id: "a" }, { id: "n1" }, { id: "c" }, { id: "p", company: "co" }, { id: "n2" }];
  const key = (x: { id: string; company?: string }) => x.company ?? x.id;
  assert.deepEqual(sortByLastCall(items, key, newestFirst, "desc").map((x) => x.id), ["c", "a", "p", "n1", "n2"]);
  assert.deepEqual(sortByLastCall(items, key, newestFirst, "asc").map((x) => x.id), ["p", "a", "c", "n1", "n2"]);
});
