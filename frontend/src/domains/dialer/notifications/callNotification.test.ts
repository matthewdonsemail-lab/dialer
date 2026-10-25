import { test } from "node:test";
import assert from "node:assert/strict";
import { isNotificationSupported, getNotificationPermission, dismissCallNotification } from "./callNotification";

test("notification permission check runs safely in test environment", () => {
  const perm = getNotificationPermission();
  assert.equal(typeof perm, "string");
});

test("dismissCallNotification is safe when no notification is active", () => {
  assert.doesNotThrow(() => dismissCallNotification());
});
