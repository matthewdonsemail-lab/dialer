/**
 * Contact notes live in one TEXT field on the record (agencyProspect.notes /
 * agencyLead.note). Notes added from the contact page are appended as
 * entries with a header line, so the feed can show each one at its time
 * while the field stays readable in Twenty:
 *
 *   --- 2026-10-10T08:40:00.000Z | Matt
 *   Asked for a callback on Tuesday.
 *
 * Text before the first header (older free-form notes) is kept as is.
 */

export interface NoteEntry {
  at: string | null;
  author: string | null;
  body: string;
}

const HEADER = /^--- (\d{4}-\d{2}-\d{2}T[\d:.]+Z) \| (.*)$/;

export function parseNotes(raw: string | null | undefined): NoteEntry[] {
  const entries: NoteEntry[] = [];
  let current: NoteEntry = { at: null, author: null, body: "" };
  const push = () => {
    const body = current.body.trim();
    if (body) entries.push({ ...current, body });
  };
  for (const line of String(raw ?? "").split(/\r?\n/)) {
    const m = HEADER.exec(line);
    if (m) {
      push();
      current = { at: m[1], author: m[2].trim() || null, body: "" };
    } else {
      current.body += `${line}\n`;
    }
  }
  push();
  return entries;
}

export function appendNote(raw: string | null | undefined, body: string, author: string, at = new Date()): string {
  const entry = `--- ${at.toISOString()} | ${author.replace(/\s+/g, " ").trim()}\n${body.trim()}`;
  const existing = String(raw ?? "").trimEnd();
  return existing ? `${existing}\n\n${entry}` : entry;
}
