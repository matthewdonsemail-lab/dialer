import { test } from "node:test";
import assert from "node:assert/strict";
import { frameAllowed, prospectPageUrl } from "./index.js";

const LIVE_CSP =
  "frame-ancestors 'self' https://listeningkit.com https://www.listeningkit.com https://twenty.inferencesaver.com https://*.vercel.app https://*.ts.net http://localhost:3000";

test("the prospect page lives on the offer site", () => {
  assert.equal(prospectPageUrl("abc", "https://offer.listeningkit.com"), "https://offer.listeningkit.com/offer/prospect/abc");
});

test("frame-ancestors decides who may embed the page", () => {
  assert.equal(frameAllowed({ csp: LIVE_CSP }, "https://dialer.listeningkit.com"), false);
  assert.equal(frameAllowed({ csp: LIVE_CSP }, "http://localhost:5173"), false);
  assert.equal(frameAllowed({ csp: LIVE_CSP }, "http://localhost:3000"), true);
  assert.equal(frameAllowed({ csp: LIVE_CSP }, "https://my-app.vercel.app"), true);
  assert.equal(frameAllowed({ csp: LIVE_CSP }, "https://listeningkit.com"), true);
  assert.equal(frameAllowed({ csp: `${LIVE_CSP} https://dialer.listeningkit.com` }, "https://dialer.listeningkit.com"), true);
});

test("X-Frame-Options applies when there is no frame-ancestors", () => {
  assert.equal(frameAllowed({ xfo: "DENY" }, "https://dialer.listeningkit.com"), false);
  assert.equal(frameAllowed({ xfo: "SAMEORIGIN" }, "https://dialer.listeningkit.com"), false);
  assert.equal(frameAllowed({}, "https://dialer.listeningkit.com"), true);
});
