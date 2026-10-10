import { test } from "node:test";
import assert from "node:assert/strict";
import { lastOutcomes, outcomeCounts } from "./lastOutcomes.js";

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
