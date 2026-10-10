import { test } from "node:test";
import assert from "node:assert/strict";
import { sortNewestFirst } from "./sortNewestFirst.js";

test("calls come back newest first by start time, whatever the id order", () => {
  const calls = [
    { id: "f", startedAt: "2026-10-02T19:29:11Z" },
    { id: "a", startedAt: "2026-10-10T14:37:43Z" },
    { id: "c", startedAt: null, created_at: "2026-10-10T14:32:37Z" },
    { id: "z", startedAt: null, created_at: null },
  ];
  assert.deepEqual(sortNewestFirst(calls).map((c) => c.id), ["a", "c", "f", "z"]);
});
