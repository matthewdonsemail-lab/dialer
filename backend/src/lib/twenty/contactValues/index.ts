/**
 * Twenty's PHONES and EMAILS composite fields hold one primary value plus a
 * list of additional ones. The dialer used to keep only the primary; these
 * helpers read the additional values as plain strings so the frontend can
 * show them (the "+2" chip on a record). Pure.
 */

type AdditionalPhone = { number?: unknown; callingCode?: unknown; countryCode?: unknown } | string;

/** One additional phone -> E.164-ish string ("+15705550100"), or null if empty. */
function formatAdditionalPhone(entry: AdditionalPhone): string | null {
  if (typeof entry === "string") return entry.trim() || null;
  if (!entry || typeof entry !== "object") return null;
  const number = String(entry.number ?? "").trim();
  if (!number) return null;
  if (number.startsWith("+")) return number;
  const code = String(entry.callingCode ?? "").trim();
  return code ? `${code.startsWith("+") ? code : `+${code}`}${number}` : number;
}

/** Additional numbers of a PHONES composite, de-duplicated, primary excluded. */
export function additionalPhones(phone: unknown, primary?: string | null): string[] {
  if (!phone || typeof phone !== "object") return [];
  const list = (phone as { additionalPhones?: unknown }).additionalPhones;
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>(primary ? [primary] : []);
  const out: string[] = [];
  for (const entry of list) {
    const formatted = formatAdditionalPhone(entry as AdditionalPhone);
    if (formatted && !seen.has(formatted)) {
      seen.add(formatted);
      out.push(formatted);
    }
  }
  return out;
}

/** Additional addresses of an EMAILS composite, de-duplicated, primary excluded. */
export function additionalEmails(email: unknown, primary?: string | null): string[] {
  if (!email || typeof email !== "object") return [];
  const list = (email as { additionalEmails?: unknown }).additionalEmails;
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>(primary ? [primary.toLowerCase()] : []);
  const out: string[] = [];
  for (const entry of list) {
    const value = typeof entry === "string" ? entry.trim() : "";
    if (value && !seen.has(value.toLowerCase())) {
      seen.add(value.toLowerCase());
      out.push(value);
    }
  }
  return out;
}
