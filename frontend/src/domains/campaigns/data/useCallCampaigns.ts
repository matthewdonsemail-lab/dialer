import { useQuery } from "@tanstack/react-query";
import { api, type CallCampaign } from "@/domains/api/client";

const KEY = ["call-campaigns"];

/** Saved call campaigns, listed on the Admin page. */
export function useCallCampaigns() {
  return useQuery<CallCampaign[]>({ queryKey: KEY, queryFn: () => api.callCampaigns.list(), staleTime: 30_000 });
}
