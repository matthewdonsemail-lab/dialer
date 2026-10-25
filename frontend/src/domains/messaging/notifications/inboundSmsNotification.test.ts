import { test } from "node:test";
import assert from "node:assert/strict";
import { showInboundSmsNotification } from "./inboundSmsNotification";

test("showInboundSmsNotification handles non-browser environment safely", () => {
  const notification = showInboundSmsNotification({
    from: "+61 412 345 678",
    body: "G'day from Sydney",
  });
  assert.equal(notification, null);
});
