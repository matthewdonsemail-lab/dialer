import type { SmsRegion, SmsRouteCheck } from "../types.js";

/** Calling codes we send from or to. Longest prefix wins (+353 before +3). */
const CODES: Array<[prefix: string, region: SmsRegion]> = [
  ["+353", "IE"],
  ["+44", "GB"],
  ["+61", "AU"],
  ["+64", "NZ"],
  ["+49", "DE"],
  ["+33", "FR"],
  ["+34", "ES"],
  ["+39", "IT"],
  ["+31", "NL"],
  ["+1", "NANP"],
];

const ISO_TO_REGION: Record<string, SmsRegion> = {
  US: "NANP",
  CA: "NANP",
  IE: "IE",
  GB: "GB",
  UK: "GB",
  AU: "AU",
  NZ: "NZ",
  DE: "DE",
  FR: "FR",
  ES: "ES",
  IT: "IT",
  NL: "NL",
};

const NAMES: Record<SmsRegion, string> = {
  NANP: "US / Canada",
  IE: "Irish",
  GB: "UK",
  AU: "Australian",
  NZ: "New Zealand",
  DE: "German",
  FR: "French",
  ES: "Spanish",
  IT: "Italian",
  NL: "Dutch",
};

/** Region of an E.164 number ("+35391..." -> IE), or null when it is not E.164 or not listed. */
export function regionOfNumber(number: string | null | undefined): SmsRegion | null {
  const n = String(number ?? "").replace(/[^\d+]/g, "");
  if (!n.startsWith("+")) return null;
  return CODES.find(([prefix]) => n.startsWith(prefix))?.[1] ?? null;
}

/** Region of an ISO country code ("IE", "us"). */
export function regionOfCountry(code: string | null | undefined): SmsRegion | null {
  return ISO_TO_REGION[String(code ?? "").trim().toUpperCase()] ?? null;
}

export function regionName(region: SmsRegion): string {
  return NAMES[region];
}

/** Names that take "an" (by sound, so "a US / Canada" but "an Irish"). */
const AN = new Set(["Irish", "Australian", "Italian"]);

function article(name: string): string {
  return AN.has(name) ? `an ${name}` : `a ${name}`;
}

/**
 * Can this number text that one? Long-code SMS only goes within one
 * numbering region: a US number texting Ireland is blocked or filtered by
 * carriers, so the dialer refuses it rather than burn the message. When a
 * region cannot be told, sending is allowed with a warning.
 */
export function checkSmsRoute(
  from: { number?: string | null; country?: string | null },
  to: { number?: string | null; country?: string | null },
): SmsRouteCheck {
  const fromRegion = regionOfNumber(from.number) ?? regionOfCountry(from.country);
  const toRegion = regionOfNumber(to.number) ?? regionOfCountry(to.country);
  if (!fromRegion || !toRegion) {
    return { ok: true, from: fromRegion, to: toRegion, warning: "The country of one of the numbers is unknown, so the route cannot be checked." };
  }
  if (fromRegion !== toRegion) {
    return {
      ok: false,
      from: fromRegion,
      to: toRegion,
      reason: `${article(NAMES[fromRegion]).replace(/^a/, "A")} number cannot text ${NAMES[toRegion]} numbers: carriers block cross-border SMS from local numbers. Send from ${article(NAMES[toRegion])} number.`,
    };
  }
  return { ok: true, from: fromRegion, to: toRegion };
}
