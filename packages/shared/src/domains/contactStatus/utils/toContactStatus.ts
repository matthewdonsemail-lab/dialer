import { contactStatusMachine } from "../lib/contactStatusMachine.js";
import type { ContactStatus } from "../types.js";

/**
 * Older code and the call dispositions use lower-case values ("call_back",
 * "not_interested"); Twenty stores CONTACTED, CALLBACK... Every value goes
 * through here on the way in, so the two never drift apart again.
 */
const ALIASES: Record<string, ContactStatus> = {
  CALL_BACK: "CALLBACK",
  DNC: "DO_NOT_CONTACT",
  QUALIFIED: "INTERESTED",
  BOOKED: "CALLBACK",
  LOST: "NOT_INTERESTED",
};

export function toContactStatus(value: unknown): ContactStatus | null {
  const parsed = contactStatusMachine.parse(value);
  if (parsed) return parsed;
  const upper = String(value ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  return ALIASES[upper] ?? null;
}

/** Lower-case form for the parts of the SPA that still use it. */
export function toLegacyStatus(status: ContactStatus): string {
  return status === "CALLBACK" ? "callback" : status.toLowerCase();
}
