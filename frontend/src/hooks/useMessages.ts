import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export interface ThreadMessage {
  id: string;
  direction: string;
  status: string | null;
  body: string;
  fromNumber: string;
  toNumber: string;
  telnyxMessageId: string | null;
  agencyProspectId: string | null;
  agencyLeadId: string | null;
  createdAt: string | null;
}

function keyFor(record: { prospectId?: string | null; leadId?: string | null }) {
  return ["messages", record.prospectId ?? null, record.leadId ?? null];
}

/** SMS thread for one prospect or lead, oldest first. Polls lightly. */
export function useMessageThread(record: { prospectId?: string | null; leadId?: string | null }) {
  return useQuery({
    queryKey: keyFor(record),
    queryFn: () =>
      api.messages.list({
        ...(record.prospectId ? { prospectId: record.prospectId } : {}),
        ...(record.leadId ? { leadId: record.leadId } : {}),
      }) as Promise<ThreadMessage[]>,
    staleTime: 10_000,
    refetchInterval: 15_000,
    retry: false,
  });
}

export function useSendMessage(record: { prospectId?: string | null; leadId?: string | null }) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { to: string; fromPhoneId?: string; from?: string; body: string }) =>
      api.messages.send({
        ...(record.prospectId ? { prospectId: record.prospectId } : {}),
        ...(record.leadId ? { leadId: record.leadId } : {}),
        ...data,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keyFor(record) });
    },
  });
}
