import { test } from "node:test";
import assert from "node:assert/strict";
import { AnswerScreen, type MachineResult, type ScreenDeps, type ScreenHandlers, type ScreenPhase } from "./answerScreen";
import type { AudioFrame } from "@/domains/dialer/answerDetection";

const STEP = 40;

function harness(opts: { recording?: Blob | null; probe?: boolean; play?: () => Promise<{ durationMs: number }> } = {}) {
  const events: string[] = [];
  let push: (f: AudioFrame) => void = () => {};
  let probeStopped = false;
  const deps: ScreenDeps = {
    startProbe: (_s, onFrame) => {
      if (opts.probe === false) return null;
      push = onFrame;
      return { stop: () => (probeStopped = true) };
    },
    playVoicemail: opts.play ?? (async () => ({ durationMs: 12_000 })),
  };
  const handlers: ScreenHandlers = {
    onPhase: (p: ScreenPhase | null) => events.push(`phase:${p}`),
    onHuman: (r) => events.push(`human:${r}`),
    onMachine: (r: MachineResult) => events.push(`machine:${r.left ? "left" : "skipped"}${r.failed ? ":failed" : ""}${r.seconds ? `:${r.seconds}s` : ""}`),
    onLateBeep: () => events.push("lateBeep"),
    loadRecording: async () => opts.recording ?? null,
  };
  const screen = new AnswerScreen({}, handlers, deps);
  let t = 0;
  const feed = async (segments: Array<["speech" | "silence" | "tone", number]>) => {
    for (const [kind, ms] of segments) {
      for (let e = 0; e < ms; e += STEP) {
        t += STEP;
        push({ t, voiced: kind === "speech", tone: kind === "tone" });
        await Promise.resolve(); // let async handlers (recording load, playback) settle
      }
    }
    await new Promise((r) => setTimeout(r, 0));
  };
  return { screen, events, feed, isProbeStopped: () => probeStopped };
}

const RECORDING = new Blob(["x"]);

test("a short hello then a pause connects the operator", async () => {
  const h = harness();
  h.screen.start();
  await h.feed([["speech", 600], ["silence", 1500]]);
  assert.deepEqual(h.events, ["phase:listening", "phase:null", "human:short-greeting-then-pause"]);
});

test("a machine with no recording is skipped without leaving anything", async () => {
  const h = harness({ recording: null });
  h.screen.start();
  await h.feed([["speech", 2500], ["silence", 400], ["speech", 2500]]);
  assert.deepEqual(h.events, ["phase:listening", "phase:null", "machine:skipped"]);
  assert.equal(h.isProbeStopped(), true);
});

test("a machine with a recording waits for the beep, then plays it and reports it left", async () => {
  const h = harness({ recording: RECORDING });
  h.screen.start();
  await h.feed([["speech", 2500], ["silence", 400], ["speech", 2500], ["silence", 300], ["tone", 500], ["silence", 400]]);
  assert.deepEqual(h.events, ["phase:listening", "phase:waiting-beep", "phase:leaving", "phase:null", "machine:left:12s"]);
});

test("a beep before the long greeting ends still gets the voicemail after it", async () => {
  const h = harness({ recording: RECORDING });
  h.screen.start();
  await h.feed([["speech", 1200], ["tone", 400], ["silence", 400]]);
  assert.ok(h.events.includes("machine:left:12s"), h.events.join(","));
});

test("the message is never played before the cue", async () => {
  let played = 0;
  const h = harness({ recording: RECORDING, play: async () => (played++, { durationMs: 5000 }) });
  h.screen.start();
  await h.feed([["speech", 5200]]); // machine verdict, greeting still running
  assert.equal(played, 0);
  assert.ok(h.events.includes("phase:waiting-beep"));
});

test("if no beep or quiet ever comes, the machine is skipped and nothing is played", async () => {
  let played = 0;
  const h = harness({ recording: RECORDING, play: async () => (played++, { durationMs: 5000 }) });
  h.screen.start();
  await h.feed([["speech", 32_000]]);
  assert.equal(played, 0);
  assert.equal(h.events.at(-1), "machine:skipped:failed");
});

test("a playback failure is reported as not left", async () => {
  const h = harness({ recording: RECORDING, play: async () => { throw new Error("no sender"); } });
  h.screen.start();
  await h.feed([["speech", 5200], ["silence", 300], ["tone", 400], ["silence", 400]]);
  assert.equal(h.events.at(-1), "machine:skipped:failed");
});

test("a silent pickup, or an analyser that hears nothing, connects the operator", async () => {
  const silent = harness();
  silent.screen.start();
  await silent.feed([["silence", 5000]]);
  assert.equal(silent.events.at(-1), "human:silent-pickup");
});

test("a long silence before a machine's greeting does not connect the operator early", async () => {
  const h = harness();
  h.screen.start();
  await h.feed([["silence", 3000], ["speech", 5000]]);
  assert.ok(!h.events.some((e) => e.startsWith("human")), h.events.join(","));
});

test("with nothing to listen with, it connects instead of guessing", () => {
  const h = harness({ probe: false });
  h.screen.start();
  assert.deepEqual(h.events, ["phase:null", "human:no-probe"]);
});

test("a beep soon after assuming a person raises the late-beep warning once", async () => {
  const h = harness();
  h.screen.start();
  await h.feed([["speech", 800], ["silence", 1200], ["speech", 600], ["tone", 600], ["tone", 600]]);
  assert.equal(h.events.filter((e) => e === "lateBeep").length, 1);
  assert.ok(h.events.includes("human:short-greeting-then-pause"));
});

test("stopping mid-way reports nothing more", async () => {
  const h = harness({ recording: RECORDING });
  h.screen.start();
  await h.feed([["speech", 5200]]);
  h.screen.stop();
  await h.feed([["silence", 300], ["tone", 400], ["silence", 400]]);
  assert.ok(!h.events.some((e) => e.startsWith("machine")), h.events.join(","));
});

test("exactly one outcome is reported", async () => {
  const h = harness({ recording: RECORDING });
  h.screen.start();
  await h.feed([["speech", 600], ["silence", 1500], ["speech", 6000], ["tone", 400], ["silence", 400]]);
  const outcomes = h.events.filter((e) => e.startsWith("human") || e.startsWith("machine"));
  assert.equal(outcomes.length, 1, outcomes.join(","));
});
