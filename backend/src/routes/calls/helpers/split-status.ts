import { DISPOSITION_OPTIONS, SYSTEM_CALL_STATUSES } from "../../../lib/twenty/agencyCall/index.js";

const DISPOSITIONS = new Set(DISPOSITION_OPTIONS.map((o) => o.value));

/**
 * Split a status from a client into the two call fields. `status` is a
 * SELECT of system results only, so an outcome such as INTERESTED goes to
 * `disposition` and the system result becomes COMPLETED. NO_ANSWER is both.
 * Pure.
 */
export function splitStatus(raw: unknown): { status?: string; disposition?: string } {
  if (typeof raw !== "string" || !raw) return {};
  const value = raw.toUpperCase();
  if (SYSTEM_CALL_STATUSES.has(value)) {
    return value === "NO_ANSWER" ? { status: value, disposition: value } : { status: value };
  }
  if (DISPOSITIONS.has(value)) return { status: "COMPLETED", disposition: value };
  return { status: "COMPLETED" };
}
