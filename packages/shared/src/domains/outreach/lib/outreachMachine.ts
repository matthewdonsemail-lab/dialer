import { createMachine } from "../../pipeline/index.js";
import type { OutreachStage } from "../types.js";

/**
 * agencyProspect.outboundLabel. The Blaster sequences and the dialer both
 * move prospects through it; this graph is the one both follow.
 */
export const outreachMachine = createMachine<OutreachStage>({
  field: "outboundLabel",
  initial: "NEEDS_ENRICHMENT",
  states: {
    NEEDS_ENRICHMENT: {
      label: "Needs enrichment",
      description: "Missing details (owner, site, industry) before outreach.",
      tone: "neutral",
      next: ["NEEDS_VIDEO", "READY_FOR_SMS", "SMS_IN_PROGRESS", "HUMAN_REVIEW", "DO_NOT_CONTACT"],
    },
    NEEDS_VIDEO: {
      label: "Needs video",
      description: "Details are in; the walkthrough video is not made yet.",
      tone: "progress",
      next: ["READY_FOR_SMS", "SMS_IN_PROGRESS", "HUMAN_REVIEW", "DO_NOT_CONTACT"],
    },
    READY_FOR_SMS: {
      label: "Ready to send",
      description: "Page and video are ready; nothing sent yet.",
      tone: "info",
      next: ["SMS_IN_PROGRESS", "HUMAN_REVIEW", "DO_NOT_CONTACT"],
    },
    SMS_IN_PROGRESS: {
      label: "Message sent",
      description: "The page has been sent; waiting for a reply.",
      tone: "progress",
      next: ["FOLLOW_UP_DUE", "POSITIVE_REPLY", "NEGATIVE_REPLY", "DELIVERY_FAILED", "HUMAN_REVIEW", "DO_NOT_CONTACT"],
    },
    FOLLOW_UP_DUE: {
      label: "Follow-up due",
      description: "No reply yet; time to follow up.",
      tone: "warning",
      next: ["SMS_IN_PROGRESS", "POSITIVE_REPLY", "NEGATIVE_REPLY", "HUMAN_REVIEW", "DO_NOT_CONTACT"],
    },
    POSITIVE_REPLY: {
      label: "Replied: interested",
      description: "They answered and want to talk.",
      tone: "positive",
      next: ["FOLLOW_UP_DUE", "HUMAN_REVIEW", "DO_NOT_CONTACT"],
    },
    NEGATIVE_REPLY: {
      label: "Replied: not interested",
      description: "They answered no.",
      tone: "negative",
      next: ["HUMAN_REVIEW", "DO_NOT_CONTACT"],
    },
    HUMAN_REVIEW: {
      label: "Needs review",
      description: "Something needs a person to look at it.",
      tone: "warning",
      next: ["READY_FOR_SMS", "SMS_IN_PROGRESS", "POSITIVE_REPLY", "NEGATIVE_REPLY", "DO_NOT_CONTACT"],
    },
    DELIVERY_FAILED: {
      label: "Delivery failed",
      description: "The carrier did not deliver the message.",
      tone: "negative",
      next: ["READY_FOR_SMS", "SMS_IN_PROGRESS", "HUMAN_REVIEW", "DO_NOT_CONTACT"],
    },
    DO_NOT_CONTACT: {
      label: "Do not contact",
      description: "Opted out. No more messages.",
      tone: "negative",
      next: [],
      terminal: true,
    },
  },
});

/**
 * "The page was sent" as a pipeline event: which stage the prospect moves
 * to, or why sending is not allowed at all.
 */
export function onPageSent(current: unknown): { ok: true; to: OutreachStage; changed: boolean } | { ok: false; reason: string } {
  const from = outreachMachine.parse(current) ?? outreachMachine.initial;
  if (from === "DO_NOT_CONTACT") return { ok: false, reason: "This prospect opted out. Do not send them anything." };
  if (from === "NEGATIVE_REPLY") return { ok: false, reason: "They already said no. Move them to Needs review first if this is a deliberate retry." };
  if (from === "POSITIVE_REPLY") return { ok: true, to: from, changed: false };
  const result = outreachMachine.transition(from, "SMS_IN_PROGRESS");
  return result.ok ? { ok: true, to: result.to, changed: result.changed } : { ok: false, reason: result.reason };
}
