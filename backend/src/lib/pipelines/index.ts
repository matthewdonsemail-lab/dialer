import { contactStatusMachine, toContactStatus, type ContactStatus } from "@dialer/shared";
import { getTwenty } from "../twenty/client/index.js";

/**
 * Write-side guard for coldCallStatus. Every route that changes a contact's
 * status goes through here, so a change the pipeline does not allow is
 * refused with a reason (HTTP 409) instead of landing in Twenty.
 */
export type GuardResult = { ok: true; to: ContactStatus; changed: boolean } | { ok: false; status: 400 | 409; reason: string };

/** Pure: the requested value against the current one. */
export function checkContactStatus(current: unknown, requested: unknown, options: { dnc?: unknown; reopen?: boolean } = {}): GuardResult {
  const to = options.dnc ? "DO_NOT_CONTACT" : toContactStatus(requested);
  if (!to) return { ok: false, status: 400, reason: `"${String(requested)}" is not a contact status.` };
  const from = toContactStatus(current) ?? "NEW";
  const result = contactStatusMachine.transition(from, to, { override: !!options.reopen });
  return result.ok ? { ok: true, to: result.to, changed: result.changed } : { ok: false, status: 409, reason: result.reason };
}

/** Reads the record's current status from Twenty, then checks the change. */
export async function guardContactStatus(
  object: "agencyProspects" | "agencyLeads",
  id: string,
  requested: unknown,
  options: { dnc?: unknown; reopen?: boolean } = {},
): Promise<GuardResult> {
  const record = await getTwenty<{ coldCallStatus?: unknown }>(object, id);
  const current = typeof record?.coldCallStatus === "object" && record.coldCallStatus !== null ? (record.coldCallStatus as any).value : record?.coldCallStatus;
  return checkContactStatus(current, requested, options);
}
