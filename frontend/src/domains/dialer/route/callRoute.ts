import { regionName, regionOfCountry, regionOfNumber, type SmsRegion } from "@dialer/shared";

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
  /** True when the call crosses a numbering region (an international call). */
  abroad: boolean;
  from: SmsRegion | null;
  to: SmsRegion | null;
}

/** The region a line calls from: its number, else its country. Pure. */
export function lineRegion(line: RouteLine | null | undefined): SmsRegion | null {
  return line ? regionOfNumber(line.phoneNumber) ?? regionOfCountry(line.countryCode) : null;
}

/**
 * Which line should call this contact? The selected line when it is in the
 * contact's region (or either region is unknown); otherwise a free line in
 * the contact's region, so the call stays local. When there is none, the
 * selected line is kept and the call is marked `abroad`. Pure.
 */
export function pickCallLine<L extends RouteLine>(
  lines: L[],
  current: L | null,
  to: { number?: string | null; country?: string | null },
): CallRoute<L> {
  const toRegion = regionOfNumber(to.number) ?? regionOfCountry(to.country);
  const fromRegion = lineRegion(current);
  if (!toRegion || !fromRegion || toRegion === fromRegion) {
    return { line: current, switched: false, abroad: false, from: fromRegion, to: toRegion };
  }
  const local = lines.find((l) => lineRegion(l) === toRegion && (l.callState ?? "IDLE") === "IDLE");
  if (local) return { line: local, switched: true, abroad: false, from: toRegion, to: toRegion };
  return { line: current, switched: false, abroad: true, from: fromRegion, to: toRegion };
}

/** "an Irish number" style wording for notices. Pure. */
export function regionNumberLabel(region: SmsRegion): string {
  const name = regionName(region);
  return `${/^[AEIOU]/.test(name) ? "an" : "a"} ${name} number`;
}
