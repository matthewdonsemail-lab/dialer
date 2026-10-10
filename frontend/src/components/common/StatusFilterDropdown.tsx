import { StatusOptionIcon, type StatusOption } from "./StatusSelect";
import { FilterTriggerContent, SelectMenu, filterTriggerClass } from "@/components/ui/Menu";

interface StatusFilterDropdownProps {
  value: string;
  options: StatusOption[];
  onChange: (value: string) => void;
  /** Shown before the value: "Status: All". */
  label?: string;
  /** The "no filter" choice, e.g. "All statuses". */
  allLabel?: string;
}

const ALL = "all";

/**
 * Toolbar filter: reads "Status: All" and is outlined in brand colour while a
 * value is chosen, so it is clear which filters are shaping the list.
 */
export function StatusFilterDropdown({
  value,
  options,
  onChange,
  label = "Status",
  allLabel = "All statuses",
}: StatusFilterDropdownProps) {
  const current = options.find((o) => o.value === value);
  const active = value !== ALL && !!current;

  return (
    <SelectMenu
      value={active ? value : ALL}
      searchable={options.length > 6}
      sections={[
        { options: [{ value: ALL, label: allLabel }] },
        { title: label, options: options.map((o) => ({ value: o.value, label: o.label, dot: o.dotColor, icon: o.icon ?? <StatusOptionIcon option={o} />, hint: o.hint })) },
      ]}
      onChange={onChange}
      triggerTitle={`Filter by ${label.toLowerCase()}`}
      triggerClassName={filterTriggerClass(active)}
      trigger={
        <FilterTriggerContent
          label={label}
          value={active ? current!.label : "All"}
          dot={active ? current!.dotColor : undefined}
          icon={active ? current!.icon ?? <StatusOptionIcon option={current!} /> : undefined}
        />
      }
    />
  );
}
