/**
 * A text's status in Telnyx's words -> how people say it and its colour.
 * One table for the text bubble and the history pills, so they agree.
 */
const STATUS: Record<string, { label: string; color: "gray" | "blue" | "green" | "red" | "yellow" }> = {
  sending: { label: "Sending", color: "gray" },
  queued: { label: "Queued", color: "gray" },
  sent: { label: "Sent", color: "blue" },
  delivered: { label: "Delivered", color: "green" },
  received: { label: "Received", color: "green" },
  delivery_unconfirmed: { label: "Delivery unconfirmed", color: "yellow" },
  sending_failed: { label: "Failed to send", color: "red" },
  delivery_failed: { label: "Not delivered", color: "red" },
  not_sent: { label: "Not sent", color: "red" },
  failed: { label: "Failed", color: "red" },
};

export function textStatusLabel(status: string | null | undefined): string | null {
  if (!status) return null;
  return STATUS[status.toLowerCase()]?.label ?? status;
}

/** A Twenty colour name (twentyDotClass turns it into the dot). */
export function textStatusColor(status: string | null | undefined): string {
  return STATUS[String(status ?? "").toLowerCase()]?.color ?? "gray";
}

export function isTextFailed(status: string | null | undefined): boolean {
  return textStatusColor(status) === "red";
}
