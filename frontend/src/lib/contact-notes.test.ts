import { test } from "node:test";
import assert from "node:assert/strict";
import { appendNote, parseNotes } from "./contact-notes";

test("free-form notes become one undated entry", () => {
  assert.deepEqual(parseNotes("Owner is Sam.\nPrefers mornings."), [
    { at: null, author: null, body: "Owner is Sam.\nPrefers mornings." },
  ]);
  assert.deepEqual(parseNotes(""), []);
  assert.deepEqual(parseNotes(null), []);
});

test("appended entries parse back with their time and author", () => {
  const at = new Date("2026-10-10T08:40:00.000Z");
  const raw = appendNote(appendNote("Old note", "First call went well", "Matt", at), "Send pricing", "Ann", at);
  const entries = parseNotes(raw);
  assert.equal(entries.length, 3);
  assert.deepEqual(entries[0], { at: null, author: null, body: "Old note" });
  assert.deepEqual(entries[1], { at: "2026-10-10T08:40:00.000Z", author: "Matt", body: "First call went well" });
  assert.deepEqual(entries[2], { at: "2026-10-10T08:40:00.000Z", author: "Ann", body: "Send pricing" });
});
