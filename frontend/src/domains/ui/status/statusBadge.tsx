import { Chip, statusIcon } from "@/domains/ui/chip";
import { DispositionBadge } from "@/domains/calls/disposition";
import { dispositionTypeOfStatus } from "@/domains/calls/disposition";

/** Dot colour per generic status (campaigns, meetings, records). */
const STATUS_DOT: Record<string, string> = {
  new: "#3b82f6",
  contacted: "#3b82f6",
  interested: "#f59e0b",
  not_interested: "#9ca3af",
  callback: "#8b5cf6",
  converted: "#22c55e",
  do_not_contact: "#ef4444",
  active: "#22c55e",
  paused: "#f59e0b",
  draft: "#9ca3af",
  scheduled: "#3b82f6",
  completed: "#22c55e",
  cancelled: "#ef4444",
  rescheduled: "#f59e0b",
};

const STATUS_ICON_COLOR: Record<string, string> = {
  new: "text-blue-600",
  contacted: "text-blue-600",
  interested: "text-emerald-600",
  not_interested: "text-red-600",
  callback: "text-violet-600",
  converted: "text-emerald-600",
  do_not_contact: "text-red-600",
};

/**
 * Any status as the standard chip. Call statuses go through DispositionBadge
 * so a call reads the same here as in Call History; everything else gets its
 * status icon (or a colour dot) on a gray chip.
 */
export function StatusBadge({ status }: { status: string }) {
  const key = String(status ?? "").toLowerCase();
  if (dispositionTypeOfStatus(status) || ["no_answer", "busy", "failed", "in_progress", "voicemail", "dnc"].includes(key)) {
    return <DispositionBadge status={status} />;
  }
  const label = key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
  return (
    <Chip icon={statusIcon(key)} iconClassName={STATUS_ICON_COLOR[key]} dot={STATUS_DOT[key] ?? "#9ca3af"}>
      {label || "Unknown"}
    </Chip>
  );
}
