import { test } from "node:test";
import assert from "node:assert/strict";
import { splitStatus } from "./split-status.js";

test("system results stay in status", () => {
  assert.deepEqual(splitStatus("IN_PROGRESS"), { status: "IN_PROGRESS" });
  assert.deepEqual(splitStatus("FAILED"), { status: "FAILED" });
  assert.deepEqual(splitStatus("completed"), { status: "COMPLETED" });
});

test("NO_ANSWER is both a system result and a disposition", () => {
  assert.deepEqual(splitStatus("NO_ANSWER"), { status: "NO_ANSWER", disposition: "NO_ANSWER" });
});

test("operator outcomes move to disposition with a COMPLETED status", () => {
  assert.deepEqual(splitStatus("INTERESTED"), { status: "COMPLETED", disposition: "INTERESTED" });
  assert.deepEqual(splitStatus("VOICEMAIL"), { status: "COMPLETED", disposition: "VOICEMAIL" });
  assert.deepEqual(splitStatus("DNC"), { status: "COMPLETED", disposition: "DNC" });
});

test("unknown values never reach the status SELECT", () => {
  assert.deepEqual(splitStatus("SOMETHING_ELSE"), { status: "COMPLETED" });
  assert.deepEqual(splitStatus(""), {});
  assert.deepEqual(splitStatus(undefined), {});
});
