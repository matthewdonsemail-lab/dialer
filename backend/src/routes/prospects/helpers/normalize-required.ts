/**
 * `agencyProspect` is a shared lead-gen record, not a dialer-private table.
 * The offer/quiz funnel created it and owns its contract: 741 rows where every
 * prospect has a real website, real geo, and an industry `label` that routes
 * them to the right offer. Those columns are NOT NULL because downstream
 * workflow reads them directly.
 *
 * The dialer is a second consumer and a manual cold call legitimately has less
 * information than a web form submission. This helper keeps the contract
 * without inventing data.
 *
 * IMPORTANT: Twenty coerces an empty string to NULL on write, so "" does NOT
 * satisfy a NOT NULL column (verified: POST with website:"" returns
 * `null value in column "fullAddress" ... violates not-null constraint`).
 * Genuinely-unknown text therefore becomes a placeholder rather than a blank.
 *
 * `website` and `slug` additionally carry UNIQUE btree indexes in Postgres
 * (verified against pg_indexes on _agencyProspect), so a fixed placeholder
 * would break the SECOND dialer-created prospect. Both placeholders therefore
 * carry a per-row discriminator. The website placeholder is never a valid
 * URL, so nothing downstream can mistake it for one; compare against
 * {@link isUnknownWebsite} to detect it.
 *
 * `phone` and `city` are reported as missing instead: a cold call needs
 * something to dial and the funnel routes on geography, so guessing those
 * would be worse than asking.
 *
 * Pure: no I/O, no env, no clock beyond an injected value.
 */

/** True for a placeholder this module wrote, whatever its discriminator. */
export function isUnknownWebsite(value: unknown): boolean {
  return typeof value === "string" && value.startsWith("unknown-");
}

/** Written when a NOT NULL text column has no real value. */
export const UNKNOWN_TEXT = "unknown";

/** The five industry routing values the `label` SELECT accepts. */
export const PROSPECT_LABELS = [
  "AUTO_PAINT_AND_BODY_SHOPS",
  "WINDOW_TINTING",
  "AUTO_DETAILING",
  "GENERAL_TRADES",
  "NURSERY_SCHOOL",
] as const;

export type ProspectLabel = (typeof PROSPECT_LABELS)[number];

/** Niche text -> the label whose offer should be routed to. */
const LABEL_BY_NICHE: Array<[RegExp, ProspectLabel]> = [
  [/window\s*tint|tinting/i, "WINDOW_TINTING"],
  [/detail/i, "AUTO_DETAILING"],
  [/paint|body|shop|collision/i, "AUTO_PAINT_AND_BODY_SHOPS"],
  [/nursery|school|creche/i, "NURSERY_SCHOOL"],
];

/** Slug segment: lowercase kebab, matching the funnel's existing slugs. */
function kebab(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Best label for a prospect, given whatever the caller knows.
 * `GENERAL_TRADES` is the honest default for a manually-entered cold call.
 */
export function resolveProspectLabel(input: {
  label?: unknown;
  niche?: unknown;
  source?: unknown;
}): ProspectLabel {
  const explicit = String(input.label ?? "").trim().toUpperCase();
  if ((PROSPECT_LABELS as readonly string[]).includes(explicit)) {
    return explicit as ProspectLabel;
  }
  const hints = `${String(input.niche ?? "")} ${String(input.source ?? "")}`;
  for (const [pattern, label] of LABEL_BY_NICHE) {
    if (pattern.test(hints)) return label;
  }
  return "GENERAL_TRADES";
}

/**
 * `{name}-{city}`, the funnel's own convention (e.g. "dentmaster-galway"),
 * with a discriminator so two prospects of the same name cannot collide.
 */
export function buildProspectSlug(input: {
  name?: unknown;
  city?: unknown;
  now: number;
}): string {
  const name = kebab(String(input.name ?? "")) || "prospect";
  const city = kebab(String(input.city ?? ""));
  const base = city ? `${name}-${city}` : name;
  return `${base}-${input.now.toString(36)}`;
}

/** Trimmed string, or UNKNOWN_TEXT so a NOT NULL column holds a real value. */
function orUnknown(value: unknown): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || UNKNOWN_TEXT;
}

/**
 * website is NOT NULL and UNIQUE, so a missing one still needs a value that no
 * other row can hold. "unknown-<discriminator>" satisfies both and stays
 * obviously not a URL.
 */
function websiteValue(value: unknown, discriminator: string): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || `unknown-${discriminator}`;
}

export interface RequiredProspectInput {
  name?: unknown;
  phone?: unknown;
  email?: unknown;
  website?: unknown;
  fullAddress?: unknown;
  city?: unknown;
  region?: unknown;
  country?: unknown;
  niche?: unknown;
  source?: unknown;
  label?: unknown;
  now: number;
}

export interface NormalizedProspect {
  payload: Record<string, unknown>;
  /** Populated when a required value is genuinely absent, for a 400 body. */
  missing: string[];
}

/**
 * Build the agencyProspects create payload with every NOT NULL column present.
 * `phone` and `city` are the two the dialer refuses to invent.
 */
export function normalizeRequiredProspectFields(
  input: RequiredProspectInput,
): NormalizedProspect {
  const missing: string[] = [];
  const phone = typeof input.phone === "string" ? input.phone.trim() : "";
  if (!phone) missing.push("phone");

  const city = typeof input.city === "string" ? input.city.trim() : "";
  if (!city) missing.push("city");

  const fullAddress =
    (typeof input.fullAddress === "string" ? input.fullAddress.trim() : "") || city;

  // One discriminator per row keeps both UNIQUE columns (slug, website) safe.
  const discriminator = input.now.toString(36);
  const slug = buildProspectSlug({ name: input.name, city: input.city, now: input.now });

  return {
    missing,
    payload: {
      name: (typeof input.name === "string" ? input.name.trim() : "") || phone,
      phone,
      email: orUnknown(input.email),
      website: websiteValue(input.website, discriminator),
      fullAddress: fullAddress || UNKNOWN_TEXT,
      city,
      region: orUnknown(input.region),
      country: orUnknown(input.country),
      niche: orUnknown(input.niche),
      label: resolveProspectLabel({ label: input.label, niche: input.niche, source: input.source }),
      slug,
    },
  };
}