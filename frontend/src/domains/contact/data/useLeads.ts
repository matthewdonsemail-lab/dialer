import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/domains/api/client";
import { useOptimisticDelete, useOptimisticUpdate } from "@/domains/api/optimistic";
import type { Database } from "@/domains/api/database";

type Lead = Database["public"]["Tables"]["leads"]["Row"];

export function useLeads() {
  return useQuery<Lead[]>({
    queryKey: ["leads"],
    queryFn: async () => {
      return api.leads.list();
    },
    staleTime: Infinity,
  });
}

export function useLead(leadId: string) {
  return useQuery<Lead>({
    queryKey: ["leads", leadId],
    queryFn: async () => {
      return api.leads.get(leadId);
    },
    enabled: !!leadId,
    staleTime: Infinity,
  });
}

export function useCreateLead() {
  const queryClient = useQueryClient();
  return useMutation<Lead, Error, Omit<Lead, "id" | "created_at" | "updated_at" | "call_count">>({
    mutationFn: async (lead) => {
      return api.leads.create(lead);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["contacts-page"] });
      queryClient.invalidateQueries({ queryKey: ["contacts-facets"] });
    },
  });
}

/** Instant edits: the row changes in the table and detail page before the save finishes. */
export function useUpdateLead() {
  const mutation = useOptimisticUpdate<Lead>(
    { listKey: ["contacts-page"], detailKey: (id) => ["leads", id] },
    (id, patch) => api.leads.update(id, patch),
  );
  return {
    ...mutation,
    mutate: ({ id, ...patch }: Partial<Lead> & { id: string }) => mutation.mutate({ id, patch }),
    mutateAsync: ({ id, ...patch }: Partial<Lead> & { id: string }) => mutation.mutateAsync({ id, patch }),
  };
}

/** Instant removal; pass one id or several. */
export function useDeleteLead() {
  return useOptimisticDelete<Lead>({ listKey: ["contacts-page"] }, (id) => api.leads.delete(id));
}
