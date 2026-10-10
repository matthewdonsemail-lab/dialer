import type { NewLeadInfo } from "../types.js";

/** One line, human: "New lead: Jane Doe · Acme · 555-0100". */
export function formatLeadBody(lead: NewLeadInfo): string {
  const parts: string[] = [];
  if (lead.contactName?.trim()) parts.push(lead.contactName.trim());
  if (lead.company?.trim()) parts.push(lead.company.trim());
  if (lead.phone?.trim()) parts.push(lead.phone.trim());
  const summary = parts.join(" · ");
  return summary ? `New lead: ${summary}` : "New lead added";
}