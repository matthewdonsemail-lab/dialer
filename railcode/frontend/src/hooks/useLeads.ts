import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import type { Database } from "@/types/database";

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
    },
  });
}

export function useUpdateLead() {
  const queryClient = useQueryClient();
  return useMutation<Lead, Error, Partial<Lead> & { id: string }>({
    mutationFn: async ({ id, ...updates }) => {
      return api.leads.update(id, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}

export function useDeleteLead() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      return api.leads.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}
