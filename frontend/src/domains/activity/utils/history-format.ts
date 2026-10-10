import { parseNotes } from "@/domains/contact/utils/contact-notes";
import { twentyDotClass, type TwentyOption } from "@/lib/twenty/options";
import type { AdminActivity, AdminActivityResponse } from "@/lib/admin";

/*
 * Record history, readable. Twenty's timeline diff holds raw field names and
 * raw values (enum codes, composite objects, ISO dates, the whole notes
 * log). This turns them into what CRMs show: one row per field change, a
 * human field name, values as labels / links / dates, "blank" for empty,
 * and who did it and how (Zoho Timeline, HubSpot property history, Close
 * status changes). Pure: the panel, the timeline and Admin all use it.
 */

/** Field options from GET /api/twenty/meta/:object, keyed by Twenty field name. */
export type FieldOptions = Record<string, TwentyOption[]>;

export type Display =
  | { kind: "blank" }
  | { kind: "text"; text: string }
  | { kind: "option"; text: string; dot: string }
  | { kind: "link"; text: string; href: string }
  | { kind: "colors"; colors: string[] }
  | { kind: "long"; text: string };

/** Bookkeeping fields that are not worth a history row. */
const QUIET = new Set(["updatedAt", "createdAt", "deletedAt", "searchVector", "position", "createdBy", "updatedBy", "lastHeartbeatAt"]);

const LABELS: Record<string, string> = {
  name: "Name",
  coldCallStatus: "Status",
  qualificationStatus: "Qualification",
  outboundState: "Outbound state",
  outboundLabel: "Outbound label",
  niche: "Industry",
  fullAddress: "Address",
  region: "State / region",
  logoUrl: "Logo",
  brandColors: "Brand colours",
  campaignIdId: "Campaign",
  campaignId: "Campaign",
  phone: "Phone",
  phones: "Phone",
  email: "Email",
  emails: "Email",
  notes: "Notes",
  note: "Notes",
  videoStatus: "Video",
  videoUrl: "Video link",
  googleReviewsUrl: "Google reviews",
  reviewCount: "Reviews",
  whatsappStatus: "WhatsApp",
  durationSeconds: "Duration",
  telnyxCallId: "Telnyx call ID",
  telnyxRecordingId: "Telnyx recording ID",
  recordingUrl: "Recording",
  aiScore: "AI score",
  aiSummary: "AI summary",
  aiSentiment: "AI sentiment",
};

const ACRONYMS = new Set(["sms", "mms", "dnc", "api", "url", "id", "ai", "crm", "us", "uk", "ie", "ivr"]);

function capitalise(words: string[]): string {
  return words
    .map((w, i) => (ACRONYMS.has(w) ? w.toUpperCase() : i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** "coldCallStatus" -> "Status"; unknown names are spaced out: "lastSyncedAt" -> "Last synced at". */
export function fieldName(field: string): string {
  if (LABELS[field]) return LABELS[field];
  const words = field
    .replace(/Id$/, " ID")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  return capitalise(words);
}

/** "SMS_IN_PROGRESS" -> "SMS in progress". Leaves ordinary text alone. */
export function humanizeCode(value: string): string {
  if (!/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/.test(value)) return value;
  return capitalise(value.toLowerCase().split("_"));
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;
const HEX = /^#[0-9a-f]{3,8}$/i;
const URL_RE = /^https?:\/\/\S+$/i;

function shortUrl(href: string): string {
  try {
    const u = new URL(href);
    const path = u.pathname === "/" ? "" : u.pathname;
    const text = `${u.hostname.replace(/^www\./, "")}${path}`;
    return text.length > 48 ? `${text.slice(0, 45)}…` : text;
  } catch {
    return href;
  }
}

function isBlank(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.every(isBlank);
  if (typeof v === "object") return Object.values(v as object).every(isBlank);
  return false;
}

/** Twenty composite fields and other objects, as one readable value. */
function displayObject(field: string, o: Record<string, any>, options: FieldOptions): Display {
  if ("primaryPhoneNumber" in o) {
    const num = String(o.primaryPhoneNumber ?? "");
    if (!num) return { kind: "blank" };
    const code = String(o.primaryPhoneCallingCode ?? "");
    return { kind: "text", text: num.startsWith("+") || !code ? num : `${code} ${num}` };
  }
  if ("primaryEmail" in o) return o.primaryEmail ? { kind: "text", text: String(o.primaryEmail) } : { kind: "blank" };
  if ("primaryLinkUrl" in o) {
    const href = String(o.primaryLinkUrl ?? "");
    if (!href) return { kind: "blank" };
    const url = /^https?:/i.test(href) ? href : `https://${href}`;
    return { kind: "link", href: url, text: o.primaryLinkLabel || shortUrl(url) };
  }
  if ("firstName" in o || "lastName" in o) {
    const text = `${o.firstName ?? ""} ${o.lastName ?? ""}`.trim();
    return text ? { kind: "text", text } : { kind: "blank" };
  }
  if ("addressStreet1" in o || "addressCity" in o) {
    const text = [o.addressStreet1, o.addressStreet2, o.addressCity, o.addressState, o.addressPostcode, o.addressCountry].filter(Boolean).join(", ");
    return text ? { kind: "text", text } : { kind: "blank" };
  }
  if ("amountMicros" in o) {
    if (o.amountMicros == null) return { kind: "blank" };
    return { kind: "text", text: `${(Number(o.amountMicros) / 1e6).toLocaleString()} ${o.currencyCode ?? ""}`.trim() };
  }
  if ("name" in o && "source" in o) return { kind: "text", text: String(o.name || o.source) };
  // Colour sets (brand colours): every string leaf is a hex colour.
  const leaves = Object.values(o).flatMap((v) => (Array.isArray(v) ? v : [v]));
  const strings = leaves.filter((v): v is string => typeof v === "string");
  if (strings.length && strings.every((v) => HEX.test(v))) return { kind: "colors", colors: [...new Set(strings)] };
  // Anything else: its simple entries, "key: value".
  const parts = Object.entries(o)
    .filter(([, v]) => !isBlank(v) && (typeof v !== "object" || v === null))
    .slice(0, 3)
    .map(([k, v]) => `${fieldName(k)}: ${text(displayValue(k, v, options))}`);
  if (!parts.length) return { kind: "blank" };
  // Notes-like blobs (metadata, sources) read as a block under the row, not inline.
  const joined = parts.join(" · ");
  return joined.length > 80 ? { kind: "long", text: parts.join("\n") } : { kind: "text", text: joined };
}

/** Any value Twenty stores, ready to show. */
export function displayValue(field: string, value: unknown, options: FieldOptions = {}): Display {
  if (isBlank(value)) return { kind: "blank" };
  if (typeof value === "boolean") return { kind: "text", text: value ? "Yes" : "No" };
  if (typeof value === "number") return { kind: "text", text: field === "durationSeconds" ? `${value}s` : value.toLocaleString() };
  if (Array.isArray(value)) {
    if (value.every((v) => typeof v === "string" && HEX.test(v))) return { kind: "colors", colors: value as string[] };
    const items = value.filter((v) => !isBlank(v)).map((v) => text(displayValue(field, v, options)));
    return { kind: "text", text: items.length > 4 ? `${items.slice(0, 4).join(", ")} and ${items.length - 4} more` : items.join(", ") };
  }
  if (typeof value === "object") return displayObject(field, value as Record<string, any>, options);
  const raw = String(value).trim();
  if (/^[[{]/.test(raw)) {
    try {
      return displayValue(field, JSON.parse(raw), options);
    } catch {
      // JSON cut short for transport (debug logs, big blobs): name it, never dump it.
      if (/^[[{]\s*"/.test(raw)) return { kind: "text", text: field === "debugLog" ? "SIP event log" : "Structured data" };
    }
  }
  if (field === "notes" || field === "note") {
    const entries = parseNotes(raw);
    if (entries.length > 1 || entries[0]?.at) {
      const latest = entries[entries.length - 1].body;
      const prefix = entries.length > 1 ? `${entries.length} notes, latest: ` : "";
      return latest.length + prefix.length > 120 ? { kind: "long", text: `${prefix}${latest}` } : { kind: "text", text: `${prefix}${latest}` };
    }
  }
  const option = options[field]?.find((o) => o.value === raw || o.value === raw.toUpperCase());
  if (option) return { kind: "option", text: option.label, dot: twentyDotClass(option.color) };
  if (ISO_DATE.test(raw)) return { kind: "text", text: new Date(raw).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) };
  if (URL_RE.test(raw)) return { kind: "link", href: raw, text: shortUrl(raw) };
  if (/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/.test(raw) || (/^[A-Z]{3,}$/.test(raw) && field !== "name")) {
    return { kind: "option", text: humanizeCode(raw), dot: "bg-gray-400" };
  }
  if (raw.length > 120 || raw.includes("\n")) return { kind: "long", text: raw };
  return { kind: "text", text: raw };
}

/** Plain-text form of a display value, for titles and search. */
export function text(d: Display): string {
  switch (d.kind) {
    case "blank":
      return "blank";
    case "colors":
      return d.colors.join(", ");
    default:
      return d.text;
  }
}

export type RowKind = "created" | "deleted" | "restored" | "set" | "cleared" | "changed" | "note";

export interface HistoryRow {
  /** Unique: event id + field. */
  id: string;
  at: string;
  kind: RowKind;
  field: string | null;
  label: string;
  before: Display;
  after: Display;
  /** Note rows: the entry that was added. */
  note?: string;
  who: string;
  /** "via API", "in Twenty", "by a workflow"... */
  source: string | null;
}

const SOURCES: Record<string, string> = {
  API: "via the dialer",
  MANUAL: "in Twenty",
  IMPORT: "by import",
  WORKFLOW: "by a workflow",
  EMAIL: "from email",
  CALENDAR: "from calendar",
  WEBHOOK: "by webhook",
  SYSTEM: "by Twenty",
};

/** Added notes entries: the after text extends the before text. */
function addedNote(before: unknown, after: unknown): string | null {
  const b = typeof before === "string" ? before.trimEnd() : "";
  const a = typeof after === "string" ? after : "";
  if (!a.startsWith(b) || a.trimEnd() === b) return null;
  const entries = parseNotes(a.slice(b.length));
  return entries.length ? entries.map((e) => e.body).join("\n\n") : null;
}

/** One row per field change, newest first, quiet fields dropped. */
export function historyRows(data: Pick<AdminActivityResponse, "activities" | "members"> | undefined, options: FieldOptions = {}, noun = "Record"): HistoryRow[] {
  const rows: HistoryRow[] = [];
  for (const e of data?.activities ?? []) {
    // Twenty files timeline events under "System"; the real author is the
    // updatedBy / createdBy actor the same write recorded in the diff.
    const actorChange = e.changes.find((c) => c.field === "updatedBy") ?? e.changes.find((c) => c.field === "createdBy");
    const actor = actorChange?.after && typeof actorChange.after === "object" ? (actorChange.after as { name?: string; source?: string }) : null;
    const who = actor?.name || whoOf(e, data?.members ?? {});
    const rawSource = actor?.source ?? (who === "System" ? null : e.actor.source);
    let source = rawSource ? SOURCES[rawSource.toUpperCase()] ?? `via ${rawSource.toLowerCase()}` : null;
    // The dialer's API key is named "dialer": "dialer · via the dialer" says it twice.
    if (source && source.toLowerCase().includes(who.toLowerCase())) source = null;
    const base = { at: e.happensAt, who: who.toLowerCase() === "dialer" ? "Dialer" : who, source };
    if (e.action !== "updated") {
      rows.push({ ...base, id: e.id, kind: e.action, field: null, label: `${noun} ${e.action}`, before: { kind: "blank" }, after: { kind: "blank" } });
      continue;
    }
    for (const c of e.changes) {
      if (QUIET.has(c.field)) continue;
      const id = `${e.id}:${c.field}`;
      if (c.field === "notes" || c.field === "note") {
        const note = addedNote(c.before, c.after);
        if (note) {
          rows.push({ ...base, id, kind: "note", field: c.field, label: "Note added", before: { kind: "blank" }, after: { kind: "blank" }, note });
          continue;
        }
      }
      const before = displayValue(c.field, c.before, options);
      const after = displayValue(c.field, c.after, options);
      if (before.kind !== "blank" && after.kind !== "blank" && text(before) === text(after)) continue;
      const kind: RowKind = before.kind === "blank" ? "set" : after.kind === "blank" ? "cleared" : "changed";
      if (kind === "set" && after.kind === "blank") continue;
      rows.push({ ...base, id, kind, field: c.field, label: fieldName(c.field), before, after });
    }
  }
  return rows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

function whoOf(e: AdminActivity, members: Record<string, string>): string {
  return e.actor.name || (e.actor.memberId ? members[e.actor.memberId] : null) || "Dialer";
}
