import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type CallCampaign } from "@/domains/api/client";
import { useOptimisticDelete, useOptimisticUpdate } from "@/domains/api/optimistic";

const KEY = ["call-campaigns"];

export function useCallCampaigns() {
  return useQuery<CallCampaign[]>({ queryKey: KEY, queryFn: () => api.callCampaigns.list(), staleTime: 30_000 });
}

/** New campaign from selected contacts; added to the cached list straight away. */
export function useCreateCallCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { contactIds: string[]; name: string }) => api.callCampaigns.create(data),
    onSuccess: (created) => {
      queryClient.setQueryData<CallCampaign[]>(KEY, (old) => [created, ...(old ?? []).filter((c) => c.id !== created.id)]);
    },
  });
}

/** Rename or change status; shows instantly, rolls back on failure. */
export function useUpdateCallCampaign() {
  return useOptimisticUpdate<CallCampaign>({ listKey: KEY }, (id, patch) =>
    api.callCampaigns.update(id, { name: patch.name, status: patch.status }),
  );
}

export function useDeleteCallCampaign() {
  return useOptimisticDelete<CallCampaign>({ listKey: KEY }, (id) => api.callCampaigns.delete(id));
}

/** Default campaign name: the local date and time it was created ("2026-10-10 14:05"). */
export function defaultCampaignName(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}
