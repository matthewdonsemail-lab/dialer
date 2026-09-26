import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";

export interface Script {
  id: string;
  name: string;
  campaignId: string | null;
  scriptData: any;
  created_at: string;
  updated_at: string;
}

export function useScripts() {
  return useQuery({
    queryKey: ["scripts"],
    queryFn: () => api.scripts.list(),
  });
}

export function useScript(id: string) {
  return useQuery({
    queryKey: ["scripts", id],
    queryFn: () => api.scripts.get(id),
    enabled: !!id,
  });
}

export function useCreateScript() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: Partial<Script>) => api.scripts.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scripts"] });
    },
  });
}

export function useUpdateScript() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Script> }) => 
      api.scripts.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scripts"] });
    },
  });
}

export function useDeleteScript() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => api.scripts.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scripts"] });
    },
  });
}
