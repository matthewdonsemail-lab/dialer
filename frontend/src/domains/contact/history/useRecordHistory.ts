import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/domains/api/client";
import type { AdminActivityResponse } from "@/domains/admin/data";
import { historyRows, type FieldOptions } from "@/domains/activity/historyFormat";
import type { Contact } from "@/domains/contact/model";

/** The contact's change history from Twenty, as readable rows. */
export function useRecordHistory(contact: Contact) {
  const plural = contact.type === "lead" ? "agencyLeads" : "agencyProspects";
  const activity = useQuery<AdminActivityResponse>({
    queryKey: ["record-activity", contact.type, contact.id],
    // The contact's own changes plus every call to it and text with it.
    queryFn: () => api.admin.contactActivity(contact.type, contact.id),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
  const { data: meta } = useQuery<{ fields: FieldOptions }>({
    queryKey: ["twenty-meta", plural],
    queryFn: () => api.twentyMeta.fields(plural),
    staleTime: Infinity,
  });
  const rows = useMemo(
    () => historyRows(activity.data, meta?.fields ?? {}, contact.type === "lead" ? "Lead" : "Prospect", contact.type),
    [activity.data, meta, contact.type],
  );
  return { rows, isLoading: activity.isLoading, error: activity.error as Error | null };
}
