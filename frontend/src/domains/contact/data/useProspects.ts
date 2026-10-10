import { api } from "@/domains/api/client";
import { useOptimisticDelete, useOptimisticUpdate } from "@/domains/api/optimistic";

type ProspectRow = { id: string } & Record<string, any>;

/** Instant edits: the row changes in the paged Contacts table and detail page before the save finishes. */
export function useUpdateProspect() {
  return useOptimisticUpdate<ProspectRow>(
    { listKey: ["contacts-page"], detailKey: (id) => ["prospect", id] },
    (id, patch) => api.prospects.update(id, patch),
  );
}

/** Instant removal; pass one id or several. */
export function useDeleteProspect() {
  return useOptimisticDelete<ProspectRow>({ listKey: ["contacts-page"] }, (id) => api.prospects.delete(id));
}
