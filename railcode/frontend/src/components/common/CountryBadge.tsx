import { Badge } from "@/components/ui/Badge";

/** Gray country badge; renders a dash when the record has no country. */
export function CountryBadge({ country }: { country?: string | null }) {
  const value = (country || "").trim();
  if (!value || value === "—") {
    return <span className="text-[11px] text-[var(--ods-text-tertiary)]">—</span>;
  }
  return <Badge variant="gray">{value}</Badge>;
}
