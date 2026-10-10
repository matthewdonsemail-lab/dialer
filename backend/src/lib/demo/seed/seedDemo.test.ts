import { test } from "node:test";
import assert from "node:assert/strict";
import { seedDemo, toPayload, type SeedClient } from "./seedDemo.js";
import { buildDemoRecords } from "../records/index.js";

test("payloads keep only fields the object has, plus relation keys", () => {
  const call = buildDemoRecords().agencyCalls[0];
  const payload = toPayload("agencyCalls", call);
  assert.equal(payload.agencyProspectId, call.agencyProspectId);
  assert.equal(payload.transcript, call.transcript);
  assert.equal("createdBy" in payload, false);
});

test("seeding twice creates once, then only updates", async () => {
  const store = new Map<string, Record<string, unknown>>();
  const client: SeedClient = {
    update: async (p, id) => store.has(`${p}/${id}`),
    create: async (p, data) => void store.set(`${p}/${data.id}`, data),
    remove: async (p, id) => void store.delete(`${p}/${id}`),
  };
  const first = await seedDemo(client);
  const second = await seedDemo(client);
  const sum = (rs: typeof first, k: "created" | "updated") => rs.reduce((n, r) => n + r[k], 0);
  assert.equal(sum(first, "updated"), 0);
  assert.equal(sum(second, "created"), 0);
  assert.equal(sum(second, "updated"), sum(first, "created"));
  assert.ok(store.has(`callCampaigns/${buildDemoRecords().agencyCallCampaigns[0].id}`));
  await seedDemo(client, { reset: true });
  assert.equal(store.size, 0);
});
