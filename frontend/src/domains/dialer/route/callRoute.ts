import { regionName, regionOfCountry, regionOfNumber, type SmsRegion } from "@dialer/shared";
import { countryCode, countryName } from "@/domains/country/lookup";

/** A number the operator can call from (DialerLine's shape, as much as this needs). */
export interface RouteLine {
  id: string;
  phoneNumber: string;
  countryCode: string | null;
  callState?: string;
}

export interface CallRoute<L extends RouteLine> {
  /** The line to call from. */
  line: L | null;
  /** True when it is not the line the operator had selected. */
  switched: boolean;
  /** True when the call goes to another country (an international call). */
  abroad: boolean;
  /** The contact's country or region, in words ("Canada", "Irish"), when known. */
  toName: string | null;
}

/** ISO country of a line: its countryCode, else none (a +1 number is US or Canada). Pure. */
export function lineCountry(line: RouteLine | null | undefined): string | null {
  return countryCode(line?.countryCode ?? undefined) ?? null;
}

/** The calling region of a line: its number, else its country. Pure. */
export function lineRegion(line: RouteLine | null | undefined): SmsRegion | null {
  return line ? (regionOfNumber(line.phoneNumber) ?? regionOfCountry(line.countryCode)) : null;
}

const idle = (l: RouteLine) => (l.callState ?? "IDLE") === "IDLE";

/**
 * Which line should call this contact? Countries are compared first, so a
 * US number never counts as local for a Canadian contact even though both
 * dial +1. When either country is unknown, the calling region decides
 * (+353 vs +1). A contact in another country is called from a free line in
 * their country; with none, the selected line is kept and the call is
 * marked `abroad`. Pure.
 */
export function pickCallLine<L extends RouteLine>(
  lines: L[],
  current: L | null,
  to: { number?: string | null; country?: string | null },
): CallRoute<L> {
  const toCountry = countryCode(to.country ?? undefined) ?? null;
  const fromCountry = lineCountry(current);
  if (toCountry && fromCountry) {
    if (toCountry === fromCountry) return { line: current, switched: false, abroad: false, toName: countryName(toCountry) };
    const local = lines.find((l) => lineCountry(l) === toCountry && idle(l));
    return local
      ? { line: local, switched: true, abroad: false, toName: countryName(toCountry) }
      : { line: current, switched: false, abroad: true, toName: countryName(toCountry) };
  }
  const toRegion = regionOfNumber(to.number) ?? regionOfCountry(toCountry);
  const fromRegion = lineRegion(current);
  if (!toRegion || !fromRegion || toRegion === fromRegion) {
    return { line: current, switched: false, abroad: false, toName: toRegion ? regionName(toRegion) : null };
  }
  const local = lines.find((l) => lineRegion(l) === toRegion && idle(l));
  return local
    ? { line: local, switched: true, abroad: false, toName: regionName(toRegion) }
    : { line: current, switched: false, abroad: true, toName: regionName(toRegion) };
}
