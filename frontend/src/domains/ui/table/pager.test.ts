import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PAGE_SIZE, pageButtons, pageCount, parsePageSize } from "./pager";

test("page count rounds up and is never below one", () => {
  assert.equal(pageCount(0, 20), 1);
  assert.equal(pageCount(120, 20), 6);
  assert.equal(pageCount(121, 20), 7);
});

test("an unknown saved page size falls back to the default", () => {
  assert.equal(parsePageSize(100), 100);
  assert.equal(parsePageSize(37), DEFAULT_PAGE_SIZE);
  assert.equal(parsePageSize(undefined), DEFAULT_PAGE_SIZE);
});

test("page buttons keep the first, last and neighbours, with gaps between", () => {
  assert.deepEqual(pageButtons(0, 3), [0, 1, 2]);
  assert.deepEqual(pageButtons(5, 20), [0, null, 4, 5, 6, null, 19]);
  assert.deepEqual(pageButtons(0, 1), [0]);
});
