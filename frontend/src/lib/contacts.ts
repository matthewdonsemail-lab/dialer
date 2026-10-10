import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useOptimisticDelete, useOptimisticUpdate } from "@/hooks/use-optimistic-mutations";

/*
 * Contacts are loaded a window at a time. The server (GET /api/prospects/page)
 * applies search, filters and sort in Twenty and returns the total, so the
 * browser only holds the pages around what is on screen.
 * Pages that need a handful of contacts (call names, a campaign's numbers)
 * look them up by id instead of loading the whole list.
 */

export type ContactType = "prospect" | "lead";

export interface ContactRow {
  id: string;
  type: ContactType;
  first_name?: string;
  last_name?: string;
  company?: string;
  phone?: string;
  email?: string;
  city?: string;
  state?: string;
  country?: string;
  status?: string;
  source?: string;
  niche?: string;
  campaign_id?: string | null;
  createdByMemberId?: string | null;
  created_at?: string;
  /** Most recent call to this contact. */
  lastCall: { id: string; status: string | null; at: string | null } | null;
  [key: string]: unknown;
}

export interface ContactPage {
  offset: number;
  rows: ContactRow[];
  totalCount: number | null;
  counts: Record<ContactType, number>;
}

export interface ContactFacets {
  total: number;
  type: Record<ContactType, number>;
  /** Twenty coldCallStatus -> count ("__blank" = no status, shown as New). */
  status: Record<string, number>;
  /** Raw country value -> count. */
  country: Record<string, number>;
  industry: Record<string, number>;
  /** Campaign id -> count. */
  campaign: Record<string, number>;
  /** Prospects that name the member who created them. */
  creator: number;
}

export interface ContactQuery {
  q?: string;
  type?: ContactType[];
  status?: string[];
  /** Raw country values (several spellings of one country). */
  country?: string[];
  industry?: string[];
  campaign?: string;
  sort?: string;
  dir?: "asc" | "desc";
}

function toParams(query: ContactQuery, offset = 0, limit = PAGE_SIZE): string {
  const p = new URLSearchParams();
  p.set("offset", String(offset));
  p.set("limit", String(limit));
  if (query.q?.trim()) p.set("q", query.q.trim());
  if (query.type?.length) p.set("type", query.type.join("|"));
  if (query.status?.length) p.set("status", query.status.join("|"));
  if (query.country?.length) p.set("country", query.country.join("|"));
  if (query.industry?.length) p.set("industry", query.industry.join("|"));
  if (query.campaign) p.set("campaign", query.campaign);
  if (query.sort) p.set("sort", query.sort);
  if (query.dir) p.set("dir", query.dir);
  return p.toString();
}

export const contactsApi = {
  page: (query: ContactQuery, offset: number) => api.contacts.page(toParams(query, offset)) as Promise<ContactPage>,
  facets: () => api.contacts.facets() as Promise<ContactFacets>,
  lookup: (ids: string[]) => api.contacts.lookup(ids) as Promise<ContactRow[]>,
};

/** Rows per request; the table asks for the windows around what is on screen. */
export const PAGE_SIZE = 50;

/**
 * The Contacts table's data, modelled on Twenty's virtualized record table:
 * rows live in fixed 50-row pages fetched by offset, only the pages around
 * the visible range are requested, and every other row is a skeleton until
 * its page arrives. `range` is the [first, last] row index on screen.
 */
export function useContactWindow(query: ContactQuery, range: [number, number]) {
  const first = Math.max(0, Math.floor(range[0] / PAGE_SIZE));
  const last = Math.max(first, Math.floor(range[1] / PAGE_SIZE));
  const pageIndexes = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  // Page 0 always loads: it carries the total that sizes the scroll area.
  if (!pageIndexes.includes(0)) pageIndexes.unshift(0);

  const results = useQueries({
    queries: pageIndexes.map((page) => ({
      queryKey: ["contacts-page", query, page],
      queryFn: () => contactsApi.page(query, page * PAGE_SIZE),
      staleTime: 30_000,
      placeholderData: keepPreviousData,
    })),
  });

  const byPage = new Map<number, ContactPage>();
  results.forEach((r, i) => r.data && !r.isPlaceholderData && byPage.set(pageIndexes[i], r.data));
  const head = results[pageIndexes.indexOf(0)];
  return {
    total: head?.data?.totalCount ?? null,
    initialLoading: !!head?.isLoading,
    fetching: results.some((r) => r.isFetching),
    error: results.find((r) => r.error)?.error as Error | undefined,
    /** The row at an index, or undefined while its page is loading. */
    rowAt: (index: number): ContactRow | undefined => byPage.get(Math.floor(index / PAGE_SIZE))?.rows[index % PAGE_SIZE],
    /** Every loaded row, for selection and lookups. */
    loaded: [...byPage.entries()].sort((a, b) => a[0] - b[0]).flatMap(([, p]) => p.rows),
  };
}

/** Counts per status / country / industry / campaign / type, from Twenty groupBy. */
export function useContactFacets() {
  return useQuery({ queryKey: ["contacts-facets"], queryFn: contactsApi.facets, staleTime: 60_000 });
}

/**
 * Just the contacts with these ids (prospects), fetched 200 at a time and
 * cached. Returns an id -> row map.
 */
export function useProspectLookup(ids: (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter((id): id is string => !!id))].sort();
  return useQuery({
    queryKey: ["prospect-lookup", unique],
    queryFn: async () => {
      const chunks: string[][] = [];
      for (let i = 0; i < unique.length; i += 200) chunks.push(unique.slice(i, i + 200));
      const rows = (await Promise.all(chunks.map((c) => contactsApi.lookup(c)))).flat();
      return new Map(rows.map((r) => [r.id, r]));
    },
    enabled: unique.length > 0,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
}

/** Instant edits to a contact row in the paged table (prospects and leads). */
export function useUpdateContact(type: ContactType) {
  return useOptimisticUpdate<ContactRow>(
    { listKey: ["contacts-page"], detailKey: (id) => (type === "lead" ? ["leads", id] : ["prospect", id]) },
    (id, patch) => (type === "lead" ? api.leads.update(id, patch) : api.prospects.update(id, patch)),
  );
}

export function useDeleteContacts() {
  return useOptimisticDelete<ContactRow>({ listKey: ["contacts-page"] }, (id) => api.prospects.delete(id));
}

/** Display name for a contact row. */
export function contactName(r: Pick<ContactRow, "first_name" | "last_name" | "company" | "phone"> | undefined | null): string | null {
  if (!r) return null;
  return `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || r.company || r.phone || null;
}
