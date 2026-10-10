import { Globe } from "@/domains/ui/icons";
import { countryCode, countryName } from "@/domains/country/lookup";
import { flagUrl } from "./flagUrl";

/** Rectangular flag for an ISO code; a globe when the country is unknown. */
export function CountryFlag({ code, className = "" }: { code: string | null; className?: string }) {
  const url = flagUrl(code);
  if (!url) {
    return <Globe className={`w-[18px] h-3 shrink-0 text-[var(--ods-text-tertiary)] ${className}`} aria-hidden="true" />;
  }
  return (
    <img
      src={url}
      alt=""
      aria-hidden="true"
      loading="lazy"
      width={18}
      height={12}
      className={`w-[18px] h-3 shrink-0 rounded-[2px] object-cover shadow-[0_0_0_1px_rgba(0,0,0,0.12)] ${className}`}
    />
  );
}

/** Flag + full country name, e.g. [IE flag] Ireland. Renders a dash when blank. */
export function CountryBadge({ country }: { country?: string | null }) {
  const value = (country || "").trim();
  if (!value || value === "—") {
    return <span className="text-[13px] text-[var(--ods-text-tertiary)]">—</span>;
  }
  const code = countryCode(value);
  return (
    <span className="inline-flex items-center gap-2 min-w-0" title={code ?? undefined}>
      <CountryFlag code={code} />
      <span className="truncate">{countryName(value)}</span>
    </span>
  );
}
