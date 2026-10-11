import { test } from "node:test";
import assert from "node:assert/strict";
import { AnswerAnalyzer, DropWatcher, type AudioFrame } from "./answerAnalyzer";

const STEP = 40;

/** Build frames from a timeline of [kind, ms] segments. */
function frames(segments: Array<["speech" | "silence" | "tone", number]>): AudioFrame[] {
  const out: AudioFrame[] = [];
  let t = 0;
  for (const [kind, ms] of segments) {
    for (let elapsed = 0; elapsed < ms; elapsed += STEP) {
      t += STEP;
      out.push({ t, voiced: kind === "speech", tone: kind === "tone" });
    }
  }
  return out;
}

function run(segments: Array<["speech" | "silence" | "tone", number]>) {
  const a = new AnswerAnalyzer();
  for (const f of frames(segments)) a.push(f);
  return a.result;
}

test("a short hello then a pause is a person", () => {
  const d = run([["speech", 600], ["silence", 2000]]);
  assert.equal(d?.verdict, "human");
  assert.equal(d?.reason, "short-greeting-then-pause");
});

test("a business greeting of about three seconds then waiting is still a person", () => {
  const d = run([["speech", 3000], ["silence", 2000]]);
  assert.equal(d?.verdict, "human");
});

test("a person is decided about a second after they stop talking, not before", () => {
  const a = new AnswerAnalyzer();
  let decidedAt: number | null = null;
  for (const f of frames([["speech", 800], ["silence", 3000]])) {
    const d = a.push(f);
    if (d && decidedAt === null) decidedAt = d.at;
  }
  assert.ok(decidedAt !== null && decidedAt >= 800 + 900 && decidedAt <= 800 + 900 + STEP * 2, `decided at ${decidedAt}`);
});

test("a recorded greeting that runs on with short pauses is a machine", () => {
  const d = run([
    ["speech", 2500], ["silence", 500], ["speech", 2500], ["silence", 400], ["speech", 2000],
  ]);
  assert.equal(d?.verdict, "machine");
  assert.equal(d?.reason, "long-greeting");
});

test("a beep is a machine even after a short greeting", () => {
  const d = run([["speech", 1500], ["silence", 300], ["tone", 400], ["silence", 1000]]);
  assert.equal(d?.verdict, "machine");
  assert.equal(d?.reason, "beep");
});

test("a very short tone blip is not a beep", () => {
  const d = run([["speech", 500], ["tone", 80], ["speech", 400], ["silence", 2000]]);
  assert.equal(d?.verdict, "human");
});

test("a long greeting followed by a pause is a machine", () => {
  const d = run([["speech", 5200], ["silence", 1500]]);
  assert.equal(d?.verdict, "machine");
});

test("a silent pickup is unsure, so the caller connects the operator", () => {
  const d = run([["silence", 6000]]);
  assert.equal(d?.verdict, "unsure");
  assert.equal(d?.reason, "silent-pickup");
});

test("once decided, later frames change nothing", () => {
  const a = new AnswerAnalyzer();
  for (const f of frames([["speech", 500], ["silence", 1500], ["speech", 9000]])) a.push(f);
  assert.equal(a.result?.verdict, "human");
});

test("drop: the cue is the end of the beep", () => {
  const w = new DropWatcher(5000, 5000);
  const cue: string[] = [];
  let t = 5000;
  for (const [kind, ms] of [["speech", 800], ["silence", 400], ["tone", 500], ["silence", 400]] as const) {
    for (let e = 0; e < ms; e += STEP) {
      t += STEP;
      const c = w.push({ t, voiced: kind === "speech", tone: kind === "tone" });
      if (c) cue.push(c);
    }
  }
  assert.deepEqual(cue, ["beep"]);
});

test("drop: with no beep, a quiet after the greeting is the cue", () => {
  const w = new DropWatcher(5000, 5000);
  let t = 5000;
  let cue: string | null = null;
  for (let e = 0; e < 3000 && !cue; e += STEP) {
    t += STEP;
    cue = w.push({ t, voiced: false, tone: false });
  }
  assert.equal(cue, "quiet");
});

test("drop: never fires over the greeting itself", () => {
  const w = new DropWatcher(0, 0);
  let t = 0;
  for (let e = 0; e < 4000; e += STEP) {
    t += STEP;
    assert.equal(w.push({ t, voiced: true, tone: false }), null);
  }
});

test("drop: gives up when no cue ever comes", () => {
  const w = new DropWatcher(0, 0, { maxWaitMs: 1000 });
  let t = 0;
  let cue: string | null = null;
  for (let e = 0; e < 1500 && !cue; e += STEP) {
    t += STEP;
    cue = w.push({ t, voiced: true, tone: false });
  }
  assert.equal(cue, "timeout");
});

test("drop: a machine recognised by its beep cues when that beep ends", () => {
  const w = new DropWatcher(5000, 1200, {}, true);
  assert.equal(w.push({ t: 5040, voiced: false, tone: true }), null);
  assert.equal(w.push({ t: 5080, voiced: false, tone: true }), null);
  assert.equal(w.push({ t: 5120, voiced: false, tone: false }), "beep");
});

test("a greeting made of words with tiny gaps is measured by its span, not by its voiced frames", () => {
  // 40% of every 250ms is a gap between syllables, as in real speech; the span is what counts.
  const segs: Array<["speech" | "silence" | "tone", number]> = [];
  for (let i = 0; i < 26; i++) segs.push(["speech", 150], ["silence", 100]);
  const d = run(segs);
  assert.equal(d?.verdict, "machine");
  assert.equal(d?.reason, "long-greeting");
  assert.ok((d?.at ?? 0) <= 4700, `decided at ${d?.at}`);
});

test("a person talking with the same word gaps for under the limit is still a person", () => {
  const segs: Array<["speech" | "silence" | "tone", number]> = [];
  for (let i = 0; i < 10; i++) segs.push(["speech", 150], ["silence", 100]);
  segs.push(["silence", 1500]);
  assert.equal(run(segs)?.verdict, "human");
});
