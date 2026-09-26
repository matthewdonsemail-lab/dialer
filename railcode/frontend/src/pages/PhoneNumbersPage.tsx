import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Phone, MapPin, Building, Globe } from "lucide-react";
import { api } from "@/lib/apiClient";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Spokes } from "@/components/ui/Spinner";

interface AgencyPhone {
  id: string;
  phoneNumber: string;
  provider: string;
  city: string;
  state: string;
  country: string;
  status: string;
  created_at: string;
  updated_at: string;
  callState?: string | null;
  claimedByMemberId?: string | null;
  claimedByEmail?: string | null;
  claimedAt?: string | null;
  currentCallId?: string | null;
}

export function PhoneNumbersPage() {
  const { data: phones, isLoading } = useQuery<AgencyPhone[]>({
    queryKey: ["twentyPhones"],
    queryFn: async () => {
      return api.twentyPhones.list();
    },
    // Holder state is live: poll so a member grabbing a number shows up here
    staleTime: 10_000,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    if (!phones) return [];
    return phones.filter((phone) => {
      const matchesStatus = statusFilter === "all" || phone.status === statusFilter;
      const q = searchQuery.toLowerCase();
      const matchesSearch = !q ||
        (phone.phoneNumber ?? "").toLowerCase().includes(q) ||
        (phone.provider ?? "").toLowerCase().includes(q) ||
        (phone.city ?? "").toLowerCase().includes(q) ||
        (phone.state ?? "").toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [phones, statusFilter, searchQuery]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spokes className="h-8 w-8 text-[var(--ods-brand-600)]" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full select-none bg-[var(--ods-bg-primary)]">
      {/* Twenty-style Action Bar */}
      <div className="h-10 px-3 flex items-center justify-between border-b border-[var(--ods-border)] shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-[var(--ods-text-primary)]">Phone Numbers</span>
          <span className="text-[11px] font-medium text-[var(--ods-text-secondary)] px-1.5 py-0.5 rounded-[4px] bg-[var(--ods-bg-secondary)] border border-[var(--ods-border)]">
            {filtered.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--ods-text-tertiary)]" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-7 pr-3 py-1.5 text-[12px] border border-[var(--ods-border)] rounded-[4px] bg-[var(--ods-bg-primary)] text-[var(--ods-text-primary)] placeholder:text-[var(--ods-text-tertiary)] outline-none focus:border-[var(--ods-brand-500)]"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 text-[12px] border border-[var(--ods-border)] rounded-[4px] bg-[var(--ods-bg-primary)] text-[var(--ods-text-primary)] outline-none focus:border-[var(--ods-brand-500)] appearance-none cursor-pointer"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="paused">Paused</option>
          </select>
        </div>
      </div>

      {/* Flush Full-Bleed Table */}
      <div className="flex-1 w-full overflow-auto">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 bg-[var(--ods-bg-secondary)] z-10">
            <tr className="h-8 border-b border-[var(--ods-border)]">
              <th className="px-3 text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-secondary)]">Phone Number</th>
              <th className="px-3 text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-secondary)]">Provider</th>
              <th className="px-3 text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-secondary)]">City</th>
              <th className="px-3 text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-secondary)]">State</th>
              <th className="px-3 text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-secondary)]">Country</th>
              <th className="px-3 text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-secondary)]">Status</th>
              <th className="px-3 text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-secondary)]">Holder</th>
              <th className="px-3 text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-secondary)]">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--ods-border)]">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-8 text-[13px] text-[var(--ods-text-secondary)]">
                  No phone numbers found in Twenty CRM
                </td>
              </tr>
            ) : filtered.map((phone) => (
              <tr key={phone.id} className="h-8 hover:bg-[var(--ods-bg-secondary)] transition-colors">
                <td className="px-3">
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-[var(--ods-text-tertiary)]" />
                    <span className="text-[13px] font-mono text-[var(--ods-text-primary)]">{phone.phoneNumber}</span>
                  </div>
                </td>
                <td className="px-3 text-[13px] text-[var(--ods-text-secondary)]">{phone.provider}</td>
                <td className="px-3 text-[13px] text-[var(--ods-text-secondary)]">{phone.city}</td>
                <td className="px-3 text-[13px] text-[var(--ods-text-secondary)]">{phone.state}</td>
                <td className="px-3 text-[13px] text-[var(--ods-text-secondary)]">{phone.country}</td>
                <td className="px-3"><StatusBadge status={phone.status} /></td>
                <td className="px-3">
                  {(phone.callState || "IDLE") === "IDLE" || !phone.claimedByMemberId ? (
                    <span className="text-[11px] text-[var(--ods-text-tertiary)]">Free</span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-[12px] text-[var(--ods-text-primary)]" title={`Since ${phone.claimedAt || "—"}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                      {phone.callState} · {phone.claimedByEmail || phone.claimedByMemberId}
                    </span>
                  )}
                </td>
                <td className="px-3 text-[12px] text-[var(--ods-text-tertiary)]">
                  {phone.created_at ? new Date(phone.created_at).toLocaleDateString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
