import { useQuery } from "@tanstack/react-query";
import { api, type Person } from "@/lib/api-client";
import type { Contact } from "../types/contact";

/** The people at this business (agencyPerson in Twenty). */
export function usePeople(contact: Contact) {
  return useQuery<Person[]>({
    queryKey: ["people", contact.type, contact.id],
    queryFn: () => api.people.list(contact.type === "lead" ? { leadId: contact.id } : { prospectId: contact.id }),
    staleTime: 60_000,
  });
}
