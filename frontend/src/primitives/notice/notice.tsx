import type { ReactNode } from "react";
import type { Tone } from "@dialer/shared";
import { AlertTriangle, Ban, Check, Info } from "@/components/ui/icons";
import { RADIUS, TEXT, TONE_SURFACE } from "../tokens";

const ICON = { neutral: Info, info: Info, progress: Info, positive: Check, negative: Ban, warning: AlertTriangle };

/** An inline message inside a card: why something is blocked, what just happened. */
export function Notice({ tone = "neutral", title, children }: { tone?: Tone; title?: string; children: ReactNode }) {
  const Icon = ICON[tone];
  return (
    <div role={tone === "negative" || tone === "warning" ? "alert" : "status"} className={`flex items-start gap-2 p-2.5 ${RADIUS.control} border ${TEXT.meta} ${TONE_SURFACE[tone]}`}>
      <Icon className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden="true" />
      <span className="min-w-0">
        {title && <span className="block font-semibold">{title}</span>}
        {children}
      </span>
    </div>
  );
}
