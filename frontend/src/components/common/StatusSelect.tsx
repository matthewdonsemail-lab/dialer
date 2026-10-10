import type { ReactNode } from "react";
import { ChevronDown } from "@/components/ui/icons";
import { SelectMenu } from "@/components/ui/Menu";
import { Chip, statusIcon } from "@/components/ui/Chip";

export interface StatusOption {
  value: string;
  label: string;
  dotColor: string;
  bgTint: string;
  textColor: string;
  /** Tailwind text colour for the status icon (written out so Tailwind keeps it). */
  iconColor?: string;
  /** Leading visual in menus, e.g. a country flag, shown instead of the dot. */
  icon?: ReactNode;
  /** Right-aligned hint in menus, e.g. a count. */
  hint?: ReactNode;
}

interface StatusSelectProps {
  value?: string;
  onChange: (newValue: string) => void;
  disabled?: boolean;
  options: StatusOption[];
}

/** Inline status picker: the standard gray chip (coloured status icon) that opens the shared menu. */
export function StatusSelect({ value, onChange, disabled, options }: StatusSelectProps) {
  const current = options.find((o) => o.value === value) || options[0];
  if (!current || options.length === 0) return null;

  return (
    <SelectMenu
      value={current.value}
      sections={[{ title: "Status", options: options.map((o) => ({ value: o.value, label: o.label, dot: o.dotColor, icon: <StatusOptionIcon option={o} /> })) }]}
      onChange={(v) => v !== current.value && onChange(v)}
      disabled={disabled}
      width={200}
      triggerTitle="Change status"
      triggerClassName="max-w-full rounded-md"
      trigger={
        <Chip
          icon={statusIcon(current.value)}
          iconClassName={current.iconColor}
          dot={current.dotColor}
          trailing={<ChevronDown className="w-3 h-3 opacity-60 shrink-0" />}
          className="hover:border-[var(--ods-border-strong)] transition-colors"
        >
          {current.label}
        </Chip>
      }
    />
  );
}

/** The status's icon in its colour, else its colour dot. Used in menus and chips. */
export function StatusOptionIcon({ option }: { option: StatusOption }) {
  const Icon = statusIcon(option.value);
  if (Icon) return <Icon className={`w-4 h-4 shrink-0 ${option.iconColor ?? "text-[var(--ods-text-tertiary)]"}`} />;
  return <span className={`ods-menu-dot ${option.dotColor}`} />;
}
