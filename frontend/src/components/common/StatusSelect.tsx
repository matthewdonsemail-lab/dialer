import { ChevronDown } from "lucide-react";
import { SelectMenu } from "@/components/ui/Menu";

export interface StatusOption {
  value: string;
  label: string;
  dotColor: string;
  bgTint: string;
  textColor: string;
}

interface StatusSelectProps {
  value?: string;
  onChange: (newValue: string) => void;
  disabled?: boolean;
  options: StatusOption[];
}

/** Inline status picker: a coloured chip that opens the shared menu. */
export function StatusSelect({ value, onChange, disabled, options }: StatusSelectProps) {
  const current = options.find((o) => o.value === value) || options[0];
  if (!current || options.length === 0) return null;

  return (
    <SelectMenu
      value={current.value}
      sections={[{ title: "Status", options: options.map((o) => ({ value: o.value, label: o.label, dot: o.dotColor })) }]}
      onChange={(v) => v !== current.value && onChange(v)}
      disabled={disabled}
      width={200}
      triggerTitle="Change status"
      triggerClassName={`h-6 max-w-full inline-flex items-center gap-1.5 px-2 whitespace-nowrap rounded-[6px] text-[12px] font-medium border border-[var(--ods-border)] ${current.bgTint} ${current.textColor} hover:border-[var(--ods-border-strong)] transition-colors`}
      trigger={
        <>
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${current.dotColor}`} />
          <span className="truncate">{current.label}</span>
          <ChevronDown className="w-3 h-3 opacity-60 flex-shrink-0" />
        </>
      }
    />
  );
}
