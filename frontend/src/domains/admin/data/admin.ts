import { useQuery } from "@tanstack/react-query";
import { displayValue, fieldName, text } from "@/domains/activity/historyFormat";
import { api, type CallCampaign } from "@/domains/api/client";
import { useCalls, type AgencyCallRecord } from "@/domains/calls/data";
import { useCallCampaigns } from "@/domains/campaigns/data";
import { useCampaigns } from "@/domains/campaigns/data";
import { useScripts } from "@/domains/scripts/data";
import {
  MessageSquare,
  BarChart3,
  BookOpen,
  Headphones,
  Pencil,
  Phone,
  PhoneCall,
  Plus,
  RotateCcw,
  Trash2,
  User,
  Users,
  type IconComponent,
} from "@/domains/ui/icons";
import type { Bucket, DateRange } from "@/domains/reports/data";
import { useContactFacets, useProspectLookup } from "@/domains/contact/list";

/* Mirrors backend/src/routes/admin/types.ts */
export type AdminObject = "call" | "prospect" | "lead" | "phone" | "callCampaign" | "campaign" | "script" | "message";
export type AdminAction = "created" | "updated" | "deleted" | "restored";

export interface AdminActivity {
  id: string;
  happensAt: string;
  action: AdminAction;
  object: AdminObject;
  recordId: string | null;
  recordName: string | null;
  actor: { name: string | null; memberId: string | null; source: string | null };
  changes: { field: string; before: unknown; after: unknown }[];
}

export interface AdminActivityResponse {
  activities: AdminActivity[];
  members: Record<string, string>;
  totalCount: number | null;
  truncated: boolean;
}

/** `twenty` / `twentySingular`: the object names in Twenty, used for deep links. */
export const OBJECTS: Record<AdminObject, { label: string; singular: string; icon: IconComponent; twenty: string; twentySingular: string }> = {
  call: { label: "Calls", singular: "Call", icon: Phone, twenty: "agencyCalls", twentySingular: "agencyCall" },
  prospect: { label: "Prospects", singular: "Prospect", icon: Users, twenty: "agencyProspects", twentySingular: "agencyProspect" },
  lead: { label: "Leads", singular: "Lead", icon: User, twenty: "agencyLeads", twentySingular: "agencyLead" },
  phone: { label: "Phone numbers", singular: "Phone number", icon: Headphones, twenty: "agencyPhones", twentySingular: "agencyPhone" },
  callCampaign: { label: "Call campaigns", singular: "Call campaign", icon: PhoneCall, twenty: "callCampaigns", twentySingular: "callCampaign" },
  campaign: { label: "Campaigns", singular: "Campaign", icon: BarChart3, twenty: "agencyCampaigns", twentySingular: "agencyCampaign" },
  script: { label: "Scripts", singular: "Script", icon: BookOpen, twenty: "agencyScripts", twentySingular: "agencyScript" },
  message: { label: "Texts", singular: "Text", icon: MessageSquare, twenty: "agencyMessages", twentySingular: "agencyMessage" },
};

export const ACTIONS: Record<AdminAction, { label: string; color: string; icon: IconComponent; className: string; iconClassName: string }> = {
  created: { label: "Created", color: "#22c55e", icon: Plus, className: "bg-emerald-500/15 text-emerald-700", iconClassName: "text-emerald-600" },
  updated: { label: "Updated", color: "#2563eb", icon: Pencil, className: "bg-blue-500/15 text-blue-700", iconClassName: "text-blue-600" },
  deleted: { label: "Deleted", color: "#ef4444", icon: Trash2, className: "bg-red-500/15 text-red-700", iconClassName: "text-red-600" },
  restored: { label: "Restored", color: "#f59e0b", icon: RotateCcw, className: "bg-amber-500/15 text-amber-700", iconClassName: "text-amber-600" },
};

/** Who an event is credited to when nobody is known. */
export const UNATTRIBUTED = "Dialer (no person recorded)";

export function useAdminActivity(range: DateRange) {
  const since = range.start.toISOString();
  return useQuery<AdminActivityResponse>({
    queryKey: ["admin-activity", since],
    queryFn: () => api.admin.activity(since),
    staleTime: 30_000,
  });
}

/** Full history of specific records, e.g. a call and the contact it was made to. */
export function useRecordActivity(targets: { object: AdminObject; id: string | null | undefined }[]) {
  const key = targets
    .filter((t) => t.id)
    .map((t) => `${t.object}:${t.id}`)
    .join(",");
  return useQuery<AdminActivityResponse>({
    queryKey: ["record-activity", key],
    queryFn: () => api.admin.recordActivity(key),
    enabled: key.length > 0,
    staleTime: 30_000,
  });
}

interface ProspectLite {
  id: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  createdByMemberId?: string | null;
  created_at?: string;
}
interface PhoneLite {
  id: string;
  phoneNumber?: string;
  created_at?: string;
}

/**
 * The dialer's records for labelling and attributing activity. Small objects
 * (calls, phones, campaigns, scripts) are shared lists other pages already
 * load. Contacts can number in the hundreds of thousands, so only the
 * prospects and leads named in `activity` are looked up by id, and their
 * totals come from the server's counts.
 */
export function useDialerRecords(activity?: AdminActivityResponse) {
  const calls = useCalls();
  const phones = useQuery<PhoneLite[]>({ queryKey: ["twentyPhones"], queryFn: () => api.twentyPhones.list() });
  const callCampaigns = useCallCampaigns();
  const campaigns = useCampaigns();
  const scripts = useScripts();
  const facets = useContactFacets();
  const contactIds = (activity?.activities ?? []).filter((a) => a.object === "prospect" || a.object === "lead").map((a) => a.recordId);
  const lookup = useProspectLookup(contactIds);
  const looked = [...(lookup.data?.values() ?? [])];

  const callRows = (calls.data ?? []) as AgencyCallRecord[];
  const phoneRows = phones.data ?? [];
  const cc = (callCampaigns.data ?? []) as CallCampaign[];
  const camp = (campaigns.data ?? []) as any[];
  const scr = (scripts.data ?? []) as any[];
  const prospects = looked.filter((r) => r.type === "prospect") as ProspectLite[];
  const leads = looked.filter((r) => r.type === "lead") as any[];

  return {
    calls: callRows,
    prospects,
    leads,
    phones: phoneRows,
    callCampaigns: cc,
    campaigns: camp,
    scripts: scr,
    /** How many records each object holds (contacts counted by the server). */
    totals: {
      call: callRows.length,
      prospect: facets.data?.type.prospect ?? prospects.length,
      lead: facets.data?.type.lead ?? leads.length,
      phone: phoneRows.length,
      callCampaign: cc.length,
      campaign: camp.length,
      script: scr.length,
      message: 0,
    } as Record<AdminObject, number>,
    /** Prospects naming the person who created them (server count), when known. */
    prospectsWithCreator: facets.data?.creator ?? null,
    loading: calls.isLoading || facets.isLoading,
  };
}

export type DialerRecords = ReturnType<typeof useDialerRecords>;

export interface RecordInfo {
  name: string | null;
  /** Person who created the record, if Twenty knows. */
  owner: string | null;
  createdAt: string | null;
}

/** id -> name/creator lookups for every object, used to label and attribute events. */
export function recordIndex(r: DialerRecords, members: Record<string, string>): Record<AdminObject, Map<string, RecordInfo>> {
  const map = <T,>(rows: T[], f: (row: T) => [string, RecordInfo]) => new Map(rows.map(f));
  const person = (id?: string | null) => (id ? members[id] ?? null : null);
  return {
    call: map(r.calls, (c) => [c.id, { name: c.name || c.toNumber || null, owner: c.createdBy?.name ?? null, createdAt: c.created_at }]),
    prospect: map(r.prospects, (p) => [
      p.id,
      { name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || p.company || null, owner: person(p.createdByMemberId), createdAt: p.created_at ?? null },
    ]),
    lead: map(r.leads, (l) => [
      l.id,
      { name: `${l.first_name ?? ""} ${l.last_name ?? ""}`.trim() || l.company || null, owner: person(l.assigned_to), createdAt: l.created_at ?? null },
    ]),
    phone: map(r.phones, (p) => [p.id, { name: p.phoneNumber ?? null, owner: null, createdAt: p.created_at ?? null }]),
    callCampaign: map(r.callCampaigns, (c) => [c.id, { name: c.name, owner: c.createdByName, createdAt: c.createdAt }]),
    campaign: map(r.campaigns, (c) => [c.id, { name: c.name ?? null, owner: null, createdAt: c.created_at ?? null }]),
    script: map(r.scripts, (s) => [s.id, { name: s.name ?? null, owner: null, createdAt: s.created_at ?? null }]),
    // Texts are not loaded here; their events carry the name Twenty cached.
    message: new Map(),
  };
}

export interface ResolvedActivity extends AdminActivity {
  who: string;
  /** True when `who` came from the record's creator rather than the event itself. */
  viaOwner: boolean;
  name: string;
}

/**
 * Twenty logs every dialer write under the integration's API key, so events
 * rarely name a person. Credit an event to the workspace member Twenty
 * recorded, else to the person who created the record it touched.
 */
export function resolveActivities(data: AdminActivityResponse | undefined, records: DialerRecords): ResolvedActivity[] {
  if (!data) return [];
  const index = recordIndex(records, data.members);
  return data.activities.map((a) => {
    const info = a.recordId ? index[a.object].get(a.recordId) : undefined;
    const member = a.actor.memberId ? data.members[a.actor.memberId] : null;
    const who = member ?? info?.owner ?? null;
    return {
      ...a,
      who: who ?? UNATTRIBUTED,
      viaOwner: !member && !!info?.owner,
      name: info?.name || a.recordName || (a.recordId ? `${OBJECTS[a.object].singular} ${a.recordId.slice(0, 8)}` : "Unknown record"),
    };
  });
}

export function inBucket(a: { happensAt: string }, b: Bucket): boolean {
  const t = new Date(a.happensAt).getTime();
  return t >= b.start.getTime() && t < b.end.getTime();
}

export function countBy<T>(rows: T[], key: (row: T) => string): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) out.set(key(r), (out.get(key(r)) ?? 0) + 1);
  return out;
}

/** "5m ago", "3h ago", "2d ago", else a date. */
export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** A field value as readable text (labels, dates, phones), never raw JSON. */
export function formatValue(v: unknown, field = ""): string {
  return text(displayValue(field, v));
}

/** Field name for people: "coldCallStatus" -> "Status". */
export function fieldLabel(field: string): string {
  return fieldName(field);
}
