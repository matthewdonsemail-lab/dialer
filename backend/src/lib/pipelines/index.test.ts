import { test } from "node:test";
import assert from "node:assert/strict";
import { checkContactStatus } from "./index.js";

test("status writes follow the contact pipeline", () => {
  assert.deepEqual(checkContactStatus("NEW", "callback"), { ok: true, to: "CALLBACK", changed: true });
  assert.deepEqual(checkContactStatus(null, "do_not_contact"), { ok: true, to: "DO_NOT_CONTACT", changed: true });
  assert.deepEqual(checkContactStatus("CONTACTED", "anything", { dnc: true }), { ok: true, to: "DO_NOT_CONTACT", changed: true });
  const refused = checkContactStatus("DO_NOT_CONTACT", "contacted");
  assert.equal(refused.ok, false);
  assert.equal(refused.ok ? 0 : refused.status, 409);
  assert.equal(checkContactStatus("DO_NOT_CONTACT", "new", { reopen: true }).ok, true);
  assert.equal(checkContactStatus("NEW", "bogus").ok ? 0 : 400, 400);
});
