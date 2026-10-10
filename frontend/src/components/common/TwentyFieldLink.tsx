import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "@/components/ui/icons";
import { api } from "@/lib/api-client";

interface MetaResponse {
  object: { singular: string; plural: string };
  baseUrl: string;
  fields: Record<string, Array<{ label: string; value: string; color: string }>>;
}

/**
 * Deep-link into Twenty settings for the ACTUAL object field behind a table
 * column (e.g. agencyProspects/coldCallStatus), opened in a new tab.
 * The tooltip names the real field — never the display label — so what you
 * click is what you edit. Columns with no backing Twenty field link to the
 * object settings page instead (fieldName = null).
 */
export function TwentyFieldLink({
  objectName,
  fieldName,
}: {
  objectName: string;
  fieldName: string | null;
}) {
  const { data: meta } = useQuery<MetaResponse>({
    queryKey: ["twenty-meta", objectName],
    queryFn: async () => api.twentyMeta.fields(objectName),
    staleTime: Infinity,
  });

  const baseUrl = (meta?.baseUrl || "https://twenty.inferencesaver.com").replace(/\/$/, "");
  const plural = meta?.object?.plural || objectName;
  const href = fieldName
    ? `${baseUrl}/settings/objects/${plural}/${fieldName}`
    : `${baseUrl}/settings/objects/${plural}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      title={fieldName ? `Edit ${fieldName} in Twenty settings` : `Open ${plural} in Twenty settings`}
      aria-label={fieldName ? `Edit ${fieldName} in Twenty settings` : `Open ${plural} in Twenty settings`}
      className="ml-1 hidden group-hover/th:inline-flex items-center text-[var(--ods-text-tertiary)] hover:text-[var(--ods-brand-600)] align-middle"
    >
      <ExternalLink className="w-3 h-3" />
    </a>
  );
}
