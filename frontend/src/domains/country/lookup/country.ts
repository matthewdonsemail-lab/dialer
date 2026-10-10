import { countries } from "country-flag-icons";

/**
 * Country values arrive from Twenty in mixed shapes ("IE", "US", "Canada",
 * "United Kingdom", "UK"). Everything is normalised to an ISO 3166-1 alpha-2
 * code so the same country groups together, shows one English name, and gets
 * its flag.
 */

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

/** Common names that Intl does not produce, or that are not ISO codes. */
const ALIASES: Record<string, string> = {
  uk: "GB",
  "great britain": "GB",
  britain: "GB",
  england: "GB",
  scotland: "GB",
  wales: "GB",
  "northern ireland": "GB",
  usa: "US",
  "u.s.": "US",
  "u.s.a.": "US",
  "united states of america": "US",
  america: "US",
  "republic of ireland": "IE",
  eire: "IE",
  holland: "NL",
  "the netherlands": "NL",
  uae: "AE",
  "south korea": "KR",
  russia: "RU",
};

const ISO_CODES = new Set(countries.filter((c) => c.length === 2));

const BY_NAME: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const code of ISO_CODES) {
    const name = regionNames.of(code);
    if (name && name !== code) map.set(name.toLowerCase(), code);
  }
  for (const [alias, code] of Object.entries(ALIASES)) map.set(alias, code);
  return map;
})();

/** ISO alpha-2 code for a raw country value, or null when it is blank or unrecognised. */
export function countryCode(raw?: string | null): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  const upper = value.toUpperCase();
  if (upper === "UK") return "GB";
  if (ISO_CODES.has(upper)) return upper;
  return BY_NAME.get(value.toLowerCase()) ?? null;
}

/** English display name for a raw value: "IE" -> "Ireland"; unknown values pass through. */
export function countryName(raw?: string | null): string {
  const code = countryCode(raw);
  if (code) return regionNames.of(code) ?? code;
  return (raw ?? "").trim();
}
