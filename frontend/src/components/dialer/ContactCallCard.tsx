import { Phone, PhoneOff } from "@/components/ui/icons";
import { WidgetCard } from "@/components/ui/WidgetCard";
import { Chip } from "@/components/ui/Chip";
import { isLive, useDialer, type DialTarget } from "./DialerProvider";
import { formatDuration } from "./DialerDock";

/**
 * A contact page's call card. The call itself runs in the global dialer dock,
 * so it keeps going if the operator leaves this page.
 */
export function ContactCallCard({ target, className = "" }: { target: DialTarget; className?: string }) {
  const { dial, hangup, open, state, duration, target: current } = useDialer();
  const onThisContact = !!current && current.contactId === target.contactId && state !== "idle";
  const live = onThisContact && isLive(state);
  return (
    <WidgetCard
      title="Call"
      icon={Phone}
      className={className}
      info={{ title: "Call", what: "Calls run in the dialer at the top right, so you can keep working on other pages during a call." }}
    >
      <div className="flex flex-col gap-3">
        <div>
          <div className="text-[15px] font-semibold truncate">{target.name || "Unknown contact"}</div>
          <div className="text-[13px] tabular-nums text-[var(--ods-text-secondary)]">{target.phone || "No phone number"}</div>
        </div>
        {onThisContact && (
          <div className="flex items-center gap-2">
            <Chip dot={live ? "bg-emerald-500" : "bg-red-500"}>{live ? "On a call" : "Call ended"}</Chip>
            <Chip>
              <span className="tabular-nums">{formatDuration(duration)}</span>
            </Chip>
          </div>
        )}
        {live ? (
          <div className="grid grid-cols-2 gap-2">
            <button onClick={open} className="h-9 px-3 rounded-[8px] border border-[var(--ods-border-strong)] text-[13px] font-semibold hover:bg-[var(--ods-hover)]">
              Show dialer
            </button>
            <button onClick={hangup} className="h-9 px-3 rounded-[8px] bg-red-600 hover:bg-red-700 text-white text-[13px] font-semibold inline-flex items-center justify-center gap-2">
              <PhoneOff className="w-3.5 h-3.5" /> End call
            </button>
          </div>
        ) : (
          <button
            onClick={() => (onThisContact ? open() : void dial(target))}
            disabled={!target.phone}
            className="h-9 px-3 rounded-[8px] bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-[13px] font-semibold inline-flex items-center justify-center gap-2"
          >
            <Phone className="w-3.5 h-3.5" /> {onThisContact ? "Open call summary" : "Call"}
          </button>
        )}
      </div>
    </WidgetCard>
  );
}
