import { test } from "node:test";
import assert from "node:assert/strict";
import { displayValue, fieldName, historyRows, humanizeCode, text } from "./historyFormat";

const OPTIONS = { coldCallStatus: [{ label: "Call back", value: "CALLBACK", color: "amber" }] };

test("field names read like labels", () => {
  assert.equal(fieldName("coldCallStatus"), "Status");
  assert.equal(fieldName("lastSyncedAt"), "Last synced at");
  assert.equal(fieldName("telnyxCallId"), "Telnyx call ID");
});

test("enum codes become labels, preferring Twenty's own option label", () => {
  assert.equal(humanizeCode("SMS_IN_PROGRESS"), "SMS in progress");
  assert.deepEqual(displayValue("coldCallStatus", "CALLBACK", OPTIONS), { kind: "option", text: "Call back", dot: "bg-amber-500" });
  assert.deepEqual(displayValue("outboundLabel", "SMS_IN_PROGRESS"), { kind: "option", text: "SMS in progress", dot: "bg-gray-400" });
});

test("composite and JSON values never show as JSON", () => {
  assert.equal(text(displayValue("phones", { primaryPhoneNumber: "5702355822", primaryPhoneCallingCode: "+1" })), "+1 5702355822");
  assert.deepEqual(displayValue("brandColors", '{"palette":["#0693e3","#f78da7"],"primary":"#0693e3"}'), { kind: "colors", colors: ["#0693e3", "#f78da7"] });
  assert.deepEqual(displayValue("website", { primaryLinkUrl: "tinychamps.com", primaryLinkLabel: "" }), { kind: "link", href: "https://tinychamps.com", text: "tinychamps.com" });
  assert.equal(displayValue("createdBy", { name: "Admin User", source: "API" }).kind, "text");
  assert.equal(displayValue("x", "").kind, "blank");
  assert.equal(displayValue("x", { primaryEmail: "" }).kind, "blank");
});

test("urls, dates and long text get their own forms", () => {
  assert.equal(displayValue("logoUrl", "https://www.example.com/a.png").kind, "link");
  assert.equal(displayValue("startedAt", "2026-10-10T09:03:50.555Z").kind, "text");
  assert.notEqual(text(displayValue("startedAt", "2026-10-10T09:03:50.555Z")), "2026-10-10T09:03:50.555Z");
  assert.equal(displayValue("summary", "a".repeat(200)).kind, "long");
});

test("history: one row per change, quiet fields dropped, notes become the added entry", () => {
  const rows = historyRows({
    members: {},
    activities: [
      {
        id: "e1", happensAt: "2026-10-10T09:00:00Z", action: "updated", object: "prospect", recordId: "p", recordName: null,
        actor: { name: "Admin User", memberId: null, source: "API" },
        changes: [
          { field: "coldCallStatus", before: null, after: "CALLBACK" },
          { field: "createdBy", before: { name: "Twenty" }, after: { name: "Admin User" } },
          { field: "notes", before: "Old", after: "Old\n\n--- 2026-10-10T09:00:00.000Z | Admin User\nCall back Tuesday" },
        ],
      },
      { id: "e0", happensAt: "2026-10-01T09:00:00Z", action: "created", object: "prospect", recordId: "p", recordName: null, actor: { name: null, memberId: null, source: null }, changes: [] },
    ],
  }, OPTIONS, "Prospect");
  assert.deepEqual(rows.map((r) => [r.kind, r.label]), [["set", "Status"], ["note", "Note added"], ["created", "Prospect created"]]);
  assert.equal(rows[1].note, "Call back Tuesday");
  assert.equal(rows[0].source, "via the dialer");
  assert.equal(rows[0].who, "Admin User"); // from the createdBy actor in the same write
  assert.equal(rows[2].who, "Dialer");
});

test("cut-off JSON and the notes log never show raw", () => {
  assert.deepEqual(displayValue("debugLog", '{"generatedAt":"2026-10-08","events":[{"t":"x"...'), { kind: "text", text: "SIP event log" });
  assert.deepEqual(displayValue("notes", "--- 2026-10-10T09:03:50.555Z | Admin User\nQA note"), { kind: "text", text: "QA note" });
  assert.equal(text(displayValue("notes", "Old\n\n--- 2026-10-10T09:03:50.555Z | Ann\nCall back")), "2 notes, latest: Call back");
});
