import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

/*
 * Deep links into the Twenty workspace behind the dialer. Twenty's routes:
 *   /objects/<namePlural>              the object's record list
 *   /object/<nameSingular>/<id>        one record
 *   /settings/objects/<namePlural>     the object's data model settings
 */

const FALLBACK_BASE_URL = "https://twenty.inferencesaver.com";

/** The workspace address, read once from the backend's Twenty metadata route. */
export function useTwentyBaseUrl(): string {
  const { data } = useQuery<{ baseUrl?: string }>({
    queryKey: ["twenty-meta", "agencyProspects"],
    queryFn: async () => api.twentyMeta.fields("agencyProspects"),
    staleTime: Infinity,
  });
  return (data?.baseUrl || FALLBACK_BASE_URL).replace(/\/$/, "");
}

export const twentyLinks = {
  records: (base: string, plural: string) => `${base}/objects/${plural}`,
  record: (base: string, singular: string, id: string) => `${base}/object/${singular}/${id}`,
  settings: (base: string, plural: string) => `${base}/settings/objects/${plural}`,
};
