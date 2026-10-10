import { ChevronDown } from "@/domains/ui/icons";
import { SelectMenu } from "@/domains/ui/menu";
import { DISPOSITIONS, dispositionFor, outcomeLabel, type DispositionType } from "./callOutcome";

const TYPE_DOT: Record<DispositionType, string> = {
  positive: "bg-emerald-500",
  negative: "bg-red-500",
};

const TYPE_STYLE: Record<DispositionType | "pending", string> = {
  positive: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  negative: "bg-red-500/10 text-red-700 border-red-500/30",
  pending: "bg-sky-500/10 text-sky-700 border-sky-500/30",
};

const sections = (["positive", "negative"] as const).map((type) => ({
  title: type === "positive" ? "Positive" : "Negative",
  options: DISPOSITIONS.filter((d) => d.type === type).map((d) => ({ value: d.value, label: d.label, dot: TYPE_DOT[type] })),
}));

interface OutcomeSelectProps {
  value?: string;
  onChange: (newValue: string) => void;
  disabled?: boolean;
}

/**
 * Call disposition picker, grouped Positive / Negative like WAVV. The system
 * outcome "connected" (set when the line opens) shows as a prompt to choose.
 */
export function OutcomeSelect({ value = "no_answer", onChange, disabled }: OutcomeSelectProps) {
  const def = dispositionFor(value);
  const style = TYPE_STYLE[def?.type ?? "pending"];

  return (
    <SelectMenu
      value={value}
      sections={sections}
      onChange={onChange}
      disabled={disabled}
      placement="top-start"
      width={260}
      triggerTitle="Set the call disposition"
      triggerClassName={`h-9 w-full inline-flex items-center justify-between gap-2 px-3 rounded-md text-[13px] font-medium border transition-colors disabled:opacity-60 ${style}`}
      trigger={
        <>
          <span className="flex items-center gap-2 min-w-0">
            <span className={`w-2 h-2 rounded-md shrink-0 ${def ? TYPE_DOT[def.type] : "bg-sky-500"}`} />
            <span className="truncate">{outcomeLabel(value)}</span>
            {def && (
              <span className="text-[12px] font-normal opacity-70">{def.type === "positive" ? "Positive" : "Negative"}</span>
            )}
          </span>
          <ChevronDown className="w-4 h-4 opacity-60 shrink-0" />
        </>
      }
    />
  );
}
