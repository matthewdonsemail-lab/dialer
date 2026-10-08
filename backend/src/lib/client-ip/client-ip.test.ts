import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { rateLimit } from "express-rate-limit";
import type { AddressInfo } from "net";
import { clientIp } from "./index.js";

test("prefers Cloudflare's client address over the platform proxy", () => {
  assert.equal(
    clientIp({ headers: { "cf-connecting-ip": "203.0.113.7", "x-real-ip": "198.51.100.1" }, ip: "10.0.0.1" }),
    "203.0.113.7",
  );
  assert.equal(clientIp({ headers: { "x-real-ip": "198.51.100.1, 10.0.0.2" }, ip: "10.0.0.1" }), "198.51.100.1");
  assert.equal(clientIp({ headers: {}, ip: "10.0.0.1" }), "10.0.0.1");
});

test("two clients behind the same proxy get separate rate-limit buckets", async () => {
  const app = express();
  app.use(rateLimit({ windowMs: 60_000, max: 2, keyGenerator: clientIp, validate: { xForwardedForHeader: false } }));
  app.get("/", (_req, res) => {
    res.send("ok");
  });
  const server = app.listen(0);
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  const hit = (ip: string) => fetch(url, { headers: { "cf-connecting-ip": ip } }).then((r) => r.status);
  try {
    assert.deepEqual([await hit("203.0.113.1"), await hit("203.0.113.1"), await hit("203.0.113.1")], [200, 200, 429]);
    assert.equal(await hit("203.0.113.2"), 200, "a second user must not inherit the first user's exhausted bucket");
  } finally {
    server.close();
  }
});
