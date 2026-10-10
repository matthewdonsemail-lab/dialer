import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiError } from "@/domains/api/error";
import { describeError } from "./describeError";

test("pipeline refusals pass the server's reason through", () => {
  const d = describeError(new ApiError(409, "Converted cannot move to Call back. Allowed next: Do not contact.", null, "INVALID_TRANSITION"));
  assert.equal(d.kind, "refused");
  assert.equal(d.retryable, false);
  assert.equal(d.detail, "Converted cannot move to Call back. Allowed next: Do not contact.");
  assert.match(describeError(new ApiError(422, "A US / Canada number cannot text Irish numbers.", null, "SMS_ROUTE_BLOCKED")).detail, /cannot text Irish/);
});

test("generic server messages give way to Twenty's details", () => {
  const d = describeError(new ApiError(500, "Failed to update prospect in Twenty", "Invalid email format"));
  assert.equal(d.detail, "Twenty did not accept the change: Invalid email format");
  assert.equal(d.retryable, true);
  assert.equal(describeError(new ApiError(500, "Failed to update prospect in Twenty")).detail, "The server had a problem. Try again.");
});

test("no answer at all, an ended session and a missing record read plainly", () => {
  assert.equal(describeError(new ApiError(0, "x", null, "NETWORK")).kind, "network");
  assert.match(describeError(new ApiError(401, "Unauthorized")).detail, /Sign in again/);
  assert.match(describeError(new ApiError(404, "Prospect not found")).detail, /Prospect not found/);
});

test("anything else still produces a sentence", () => {
  assert.equal(describeError(new Error("Mic blocked")).detail, "Mic blocked");
  assert.equal(describeError("weird").detail, "Something went wrong. Try again.");
});
