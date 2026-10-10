import { test } from "node:test";
import assert from "node:assert/strict";
import { frontendStatusToTwenty as leadToTwenty, twentyStatusToFrontend } from "./map-lead.js";
import { frontendStatusToTwenty as prospectToTwenty } from "../../prospects/helpers/map-prospect.js";

const STATUSES = ["new", "contacted", "interested", "callback", "converted", "not_interested", "do_not_contact"];

test("every lead status the dialer writes reads back unchanged", () => {
  for (const status of STATUSES) {
    const stored = leadToTwenty(status, false);
    assert.equal(twentyStatusToFrontend({ coldCallStatus: stored }), status, `${status} -> ${stored}`);
  }
});

test("do_not_contact is saved as DO_NOT_CONTACT, not reset to NEW", () => {
  assert.equal(leadToTwenty("do_not_contact", false), "DO_NOT_CONTACT");
  assert.equal(prospectToTwenty("do_not_contact", false), "DO_NOT_CONTACT");
});
