import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type TextMessage } from "@/domains/api/client";

type ContactRef = { type: "prospect" | "lead"; id: string };

const key = (c: ContactRef) => ["messages", c.type, c.id];

/** A contact's texts, oldest first; refreshed every 15s for replies and delivery. */
export function useContactTexts(contact: ContactRef) {
  return useQuery({
    queryKey: key(contact),
    queryFn: () => api.messages.list(contact.type, contact.id),
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}

/**
 * Send a text. The bubble appears at once as "sending"; it becomes the
 * stored message on success, or is marked failed (the caller toasts why).
 */
export function useSendText(contact: ContactRef) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { fromPhoneId: string; fromNumber: string; body: string }) =>
      api.messages.send({ contactType: contact.type, contactId: contact.id, fromPhoneId: input.fromPhoneId, body: input.body }),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: key(contact) });
      const tempId = `pending-${Date.now()}`;
      const bubble: TextMessage = { id: tempId, direction: "OUTBOUND", body: input.body, fromNumber: input.fromNumber, toNumber: null, status: "sending", at: new Date().toISOString(), author: null };
      queryClient.setQueryData(key(contact), (old: { numbers: string[]; messages: TextMessage[] } | undefined) => ({
        numbers: old?.numbers ?? [],
        messages: [...(old?.messages ?? []), bubble],
      }));
      return { tempId };
    },
    onSuccess: (res, _input, ctx) => {
      queryClient.setQueryData(key(contact), (old: { numbers: string[]; messages: TextMessage[] } | undefined) =>
        old ? { ...old, messages: old.messages.map((m) => (m.id === ctx?.tempId ? res.message : m)) } : old,
      );
    },
    onError: (_err, _input, ctx) => {
      queryClient.setQueryData(key(contact), (old: { numbers: string[]; messages: TextMessage[] } | undefined) =>
        old ? { ...old, messages: old.messages.map((m) => (m.id === ctx?.tempId ? { ...m, status: "not_sent" } : m)) } : old,
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key(contact) });
      void queryClient.invalidateQueries({ queryKey: ["record-activity"] });
    },
  });
}
