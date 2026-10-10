import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeState, encodeState, generatePin, handleBridgeEvent, type AudioSession, type BridgeDeps } from "./index.js";

const NOW = new Date("2026-10-10T12:00:00Z");

function session(over: Partial<AudioSession>): AudioSession {
  return {
    id: "s1", mode: "call_me", status: "calling_agent", memberId: "m1", agentPhone: "+15550001111",
    agentLegId: "agent-1", pin: null, contactLegId: null, contactState: "idle", contactAnsweredAt: null,
    contactEndedAt: null, hangupCause: null, error: null, expiresAt: "2026-10-10T14:00:00Z", ...over,
  };
}

function fakeDeps(sessions: AudioSession[]) {
  const log: string[] = [];
  const deps: BridgeDeps = {
    store: {
      list: async () => sessions,
      update: async (id, patch) => {
        const s = sessions.find((x) => x.id === id)!;
        Object.assign(s, patch);
        log.push(`update ${id} ${JSON.stringify(patch)}`);
      },
    },
    calls: {
      answer: async (c, st) => void log.push(`answer ${c} ${st.kind}`),
      gather: async (c, _p, st) => void log.push(`gather ${c} try${st.tries}`),
      speak: async (c, _t, st) => void log.push(`speak ${c} ${st.kind}`),
      hangup: async (c) => void log.push(`hangup ${c}`),
    },
    dialInNumber: "+1 (435) 254-4945",
    now: () => NOW,
  };
  return { deps, log };
}

test("client_state round-trips and garbage decodes to null", () => {
  assert.deepEqual(decodeState(encodeState({ kind: "contact", sessionId: "s1" })), { kind: "contact", sessionId: "s1" });
  assert.equal(decodeState("not base64 json"), null);
  assert.equal(decodeState(undefined), null);
});

test("PINs are 4 digits and avoid ones in use", () => {
  const seq = [0.1, 0.1, 0.5];
  const pin = generatePin(new Set(["1900"]), () => seq.shift()!);
  assert.equal(pin, "5500");
});

test("call me: agent answering makes the session ready", async () => {
  const s = session({});
  const { deps, log } = fakeDeps([s]);
  const r = await handleBridgeEvent("call.answered", { call_control_id: "agent-1" }, deps);
  assert.match(r!, /agent answered/);
  assert.equal(s.status, "ready");
  assert.ok(log.includes("speak agent-1 agent"));
});

test("dial in: answer, ask for PIN, match it, and connect", async () => {
  const s = session({ mode: "dial_in", status: "waiting_dial_in", agentLegId: null, pin: "4821" });
  const { deps, log } = fakeDeps([s]);
  assert.equal(await handleBridgeEvent("call.initiated", { call_control_id: "in-1", direction: "incoming", to: "+14352544945" }, deps), "dial-in answered");
  const st = encodeState({ kind: "dialin", tries: 0 });
  await handleBridgeEvent("call.answered", { call_control_id: "in-1", client_state: st }, deps);
  await handleBridgeEvent("call.gather.ended", { call_control_id: "in-1", client_state: st, digits: "4821" }, deps);
  assert.equal(s.status, "ready");
  assert.equal(s.agentLegId, "in-1");
  assert.deepEqual(log.slice(0, 2), ["answer in-1 dialin", "gather in-1 try0"]);
});

test("dial in: wrong PIN retries, then hangs up after three tries", async () => {
  const s = session({ mode: "dial_in", status: "waiting_dial_in", agentLegId: null, pin: "4821" });
  const { deps, log } = fakeDeps([s]);
  for (const tries of [0, 1, 2]) {
    await handleBridgeEvent("call.gather.ended", { call_control_id: "in-1", client_state: encodeState({ kind: "dialin", tries }), digits: "0000" }, deps);
  }
  assert.deepEqual(log, ["gather in-1 try1", "gather in-1 try2", "hangup in-1"]);
  assert.equal(s.status, "waiting_dial_in");
});

test("calls to other numbers are not treated as dial-in", async () => {
  const { deps } = fakeDeps([]);
  assert.equal(await handleBridgeEvent("call.initiated", { call_control_id: "x", direction: "incoming", to: "+15559990000" }, deps), null);
});

test("contact leg: ringing, answered, then ended with the cause", async () => {
  const s = session({ status: "ready", contactLegId: "c-1", contactState: "dialing" });
  const { deps } = fakeDeps([s]);
  await handleBridgeEvent("call.initiated", { call_control_id: "c-1" }, deps);
  assert.equal(s.contactState, "ringing");
  await handleBridgeEvent("call.answered", { call_control_id: "c-1" }, deps);
  assert.equal(s.contactState, "answered");
  assert.equal(s.contactAnsweredAt, NOW.toISOString());
  await handleBridgeEvent("call.hangup", { call_control_id: "c-1", hangup_cause: "normal_clearing" }, deps);
  assert.equal(s.contactState, "ended");
  assert.equal(s.hangupCause, "normal_clearing");
});

test("operator hanging up ends the session and drops a live contact", async () => {
  const s = session({ status: "ready", contactLegId: "c-1", contactState: "answered" });
  const { deps, log } = fakeDeps([s]);
  await handleBridgeEvent("call.hangup", { call_control_id: "agent-1" }, deps);
  assert.equal(s.status, "ended");
  assert.equal(s.contactState, "ended");
  assert.ok(log.includes("hangup c-1"));
});

test("an unanswered call-me fails with a reason", async () => {
  const s = session({});
  const { deps } = fakeDeps([s]);
  await handleBridgeEvent("call.hangup", { call_control_id: "agent-1", hangup_cause: "timeout" }, deps);
  assert.equal(s.status, "failed");
  assert.match(s.error!, /did not answer/);
});
