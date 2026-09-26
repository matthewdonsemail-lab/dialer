
import React, { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import { StatusSelect } from "@/components/common/StatusSelect";
import { StatusFilterDropdown } from "@/components/common/StatusFilterDropdown";
import { mapLeadProspectStatusOptions } from "@/lib/twentyOptions";
import { RecordIndexCommandMenu } from "@/components/common/RecordIndexCommandMenu";
import { ColumnVisibilityDropdown, ColumnDef } from "@/components/common/ColumnVisibilityDropdown";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { LeadForm } from "@/components/leads/LeadForm";
import { useToast } from "@/components/ui/Toast";
import { Spokes } from "@/components/ui/Spinner";
import { Mail, Phone, RefreshCw, Search, X } from "lucide-react";
import { ActionsMenu } from "@/components/common/ActionsMenu";
import { CampaignSelect } from "@/components/common/CampaignSelect";
import { HeaderFilter } from "@/components/common/HeaderFilter";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import { useColumnOrder } from "@/hooks/useColumnOrder";
import { useColumnWidths } from "@/hooks/useColumnWidths";
import {
  SortableHeaderCell,
  ColumnResizeHandle,
} from "@/components/common/SortableHeaderCell";

type StatusFilter = string | "all";

interface Prospect {
  id: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  status?: string;
  country?: string;
  source?: string;
  campaign_id?: string | null;
  campaign_type?: string;
  notes?: string;
  dnc?: boolean;
  sync_id?: string;
  created_at?: string;
  updated_at?: string;
}

function CampaignTab({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`h-7 px-2.5 shrink-0 rounded-[6px] text-[12px] font-medium border transition-colors flex items-center gap-1.5 ${
        active
          ? "bg-[var(--ods-brand-600)] border-[var(--ods-brand-600)] text-white"
          : "border-[var(--ods-border)] text-[var(--ods-text-secondary)] hover:text-[var(--ods-text-primary)] hover:bg-[var(--ods-bg-secondary)]"
      }`}
    >
      <span className="max-w-[160px] truncate">{label}</span>
      <span
        className={`text-[11px] tabular-nums px-1 rounded-[3px] ${
          active ? "bg-white/20" : "bg-[var(--ods-bg-secondary)]"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

export function ProspectPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { success, error: toastError } = useToast();

  const { data: prospects, isLoading } = useQuery<Prospect[]>({
    queryKey: ["prospects"],
    queryFn: async () => {
      return api.prospects.list();
    },
    staleTime: Infinity,
  });

  // Fetch status options from Twenty CRM
  const { data: meta } = useQuery<{ fields: Record<string, Array<{ label: string; value: string; color: string }>> }>({
    queryKey: ["twenty-meta", "agencyProspects"],
    queryFn: async () => api.twentyMeta.fields("agencyProspects"),
    staleTime: Infinity,
  });

  const statusOptions = meta?.fields["coldCallStatus"]
    ? mapLeadProspectStatusOptions(meta.fields["coldCallStatus"])
    : [];

  // Fetch campaigns for assignment
  const { data: campaigns } = useQuery({
    queryKey: ["campaigns"],
    queryFn: async () => api.campaigns.list(),
    staleTime: Infinity,
  });

  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [campaignFilter, setCampaignFilter] = useState<string>("all");
  const [headerFilters, setHeaderFilters] = useState({ qualification: "all", industry: "all" });
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { columns, setColumns } = useColumnOrder('prospects-column-order', [
    { key: 'name', label: 'Name', visible: true },
    { key: 'company', label: 'Company', visible: true },
    { key: 'phone', label: 'Phone', visible: true },
    { key: 'status', label: 'Status', visible: true },
    { key: 'state', label: 'State', visible: true },
    { key: 'city', label: 'City', visible: true },
    { key: 'qualification', label: 'Qualification', visible: true },
    { key: 'type', label: 'Industry', visible: true },
    { key: 'campaign', label: 'Campaign', visible: true },
  ], 'name');
  const orderedColumns = columns.filter((c) => c.visible);
  const nameCol = orderedColumns.find((c) => c.key === 'name');
  const sortableKeys = orderedColumns.filter((c) => c.key !== 'name').map((c) => c.key);

  const { widths, setWidth } = useColumnWidths('prospects-column-widths', {
    name: 200, company: 180, phone: 130, status: 140, state: 120, city: 140,
    qualification: 130, type: 130, campaign: 150,
  });

  // dnd-kit header drag (x-axis locked, Name pinned) + blue insertion edge.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [edge, setEdge] = useState<"left" | "right" | null>(null);
  const pointerX = useRef(0);
  const tableRef = useRef<HTMLTableElement>(null);
  const headerEls = useRef(new Map<string, HTMLElement>());
  const registerHeader = (key: string) => (el: HTMLElement | null) => {
    if (el) headerEls.current.set(key, el);
    else headerEls.current.delete(key);
  };

  const clearDnD = () => {
    setActiveId(null);
    setOverId(null);
    setEdge(null);
  };

  const handleDragOver = (e: DragOverEvent) => {
    const id = e.over ? String(e.over.id) : null;
    setOverId(id);
    if (id) {
      const el = headerEls.current.get(id);
      if (el) {
        const r = el.getBoundingClientRect();
        setEdge(pointerX.current < r.left + r.width / 2 ? "left" : "right");
      } else {
        setEdge(null);
      }
    } else {
      setEdge(null);
    }
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (over && active.id !== over.id) {
      const from = sortableKeys.indexOf(String(active.id));
      const to = sortableKeys.indexOf(String(over.id));
      if (from >= 0 && to >= 0) {
        const next = arrayMove(sortableKeys, from, to);
        setColumns((prev) => {
          const map = new Map(prev.map((c) => [c.key, c]));
          const pinned = prev.find((c) => c.key === "name");
          return [...(pinned ? [pinned] : []), ...next.map((k) => map.get(k)!).filter(Boolean)];
        });
      }
    }
    clearDnD();
  };

  const tableVars = Object.fromEntries(
    Object.entries(widths).map(([k, v]) => [`--col-${k}`, `${v}px`])
  ) as React.CSSProperties;

  const handleColumnToggle = (key: string, visible: boolean) => {
    setColumns(prev => prev.map(c => c.key === key ? { ...c, visible } : c));
  };

  const cellBorder = "border border-[var(--ods-border)]";

  function renderProspectCell(key: string, prospect: Prospect) {
    switch (key) {
      case 'name':
        return (
          <td className={`${cellBorder} px-3 text-[13px] font-medium text-[var(--ods-text-primary)] truncate max-w-[200px] cursor-pointer hover:text-[var(--ods-brand-600)]`} onClick={() => navigate(`/prospects/${prospect.id}`)}>
            {prospect.first_name} {prospect.last_name}
          </td>
        );
      case 'company':
        return (
          <td className={`${cellBorder} px-3 text-[13px] text-[var(--ods-text-secondary)] truncate max-w-[180px]`}>{prospect.company ?? "—"}</td>
        );
      case 'phone':
        return (
          <td className={`${cellBorder} px-3 text-[13px] text-[var(--ods-text-secondary)] font-mono`}>{prospect.phone ?? "—"}</td>
        );
      case 'status':
        return (
          <td className={`${cellBorder} px-3`}>
            <StatusSelect
              value={prospect.status}
              options={statusOptions}
              onChange={(newStatus) => handleStatusChange(prospect.id, newStatus)}
            />
          </td>
        );
      case 'state':
        return (
          <td className={`${cellBorder} px-3 text-[13px] text-[var(--ods-text-secondary)] truncate max-w-[160px]`}>{prospect.state ?? "—"}</td>
        );
      case 'city':
        return (
          <td className={`${cellBorder} px-3 text-[13px] text-[var(--ods-text-secondary)] truncate max-w-[160px]`}>{prospect.city ?? "—"}</td>
        );
      case 'qualification':
        return (
          <td className={`${cellBorder} px-3`}>
            {(prospect as any).qualificationStatus ? (
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-[4px] text-[11px] font-medium border ${ (prospect as any).qualificationStatus === 'QUALIFIED' ? 'bg-green-500/10 text-green-700 border-green-200' : (prospect as any).qualificationStatus === 'DISQUALIFIED' ? 'bg-red-500/10 text-red-700 border-red-200' : 'bg-gray-500/10 text-gray-600 border-gray-200'}`}>
                {(prospect as any).qualificationStatus}
              </span>
            ) : (
              <span className="text-[11px] text-[var(--ods-text-tertiary)]">—</span>
            )}
          </td>
        );
      case 'type':
        return (
          <td className={`${cellBorder} px-3`}>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-[4px] text-[11px] font-medium bg-[var(--ods-bg-secondary)] border border-[var(--ods-border)] text-[var(--ods-text-primary)]">
              {prospect.source || "—"}
            </span>
          </td>
        );
      case 'campaign':
        return (
          <td className={`${cellBorder} px-3`}>
            <CampaignSelect
              campaigns={campaigns}
              value={prospect.campaign_id}
              onChange={(campaignId) => handleCampaignChange(prospect.id, campaignId)}
            />
          </td>
        );
      default:
        return null;
    }
  }

  // Facet counts for tabs + header filter popovers (computed over full dataset)
  const campaignCounts = useMemo(() => {
    const counts = new Map<string, number>();
    let unassigned = 0;
    for (const p of prospects ?? []) {
      if (p.campaign_id) counts.set(p.campaign_id, (counts.get(p.campaign_id) ?? 0) + 1);
      else unassigned++;
    }
    return { counts, unassigned, total: prospects?.length ?? 0 };
  }, [prospects]);

  const facetOptions = useMemo(() => {
    const qualification = new Map<string, number>();
    const industry = new Map<string, number>();
    for (const p of prospects ?? []) {
      const q = (p as any).qualificationStatus as string | undefined;
      if (q) qualification.set(q, (qualification.get(q) ?? 0) + 1);
      if (p.source) industry.set(p.source, (industry.get(p.source) ?? 0) + 1);
    }
    const toOptions = (m: Map<string, number>) =>
      [...m.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([value, count]) => ({ value, label: value, count }));
    return { qualification: toOptions(qualification), industry: toOptions(industry) };
  }, [prospects]);

  const hasActiveFilters =
    campaignFilter !== "all" ||
    statusFilter !== "all" ||
    headerFilters.qualification !== "all" ||
    headerFilters.industry !== "all" ||
    searchQuery.trim() !== "";

  const clearFilters = () => {
    setCampaignFilter("all");
    setStatusFilter("all");
    setHeaderFilters({ qualification: "all", industry: "all" });
    setSearchQuery("");
  };

  const headerFilterFor = (key: string) => {
    if (key === "qualification") {
      return (
        <HeaderFilter
          label="Qualification"
          value={headerFilters.qualification}
          options={facetOptions.qualification}
          onChange={(v) => setHeaderFilters((prev) => ({ ...prev, qualification: v }))}
        />
      );
    }
    if (key === "type") {
      return (
        <HeaderFilter
          label="Industry"
          value={headerFilters.industry}
          options={facetOptions.industry}
          onChange={(v) => setHeaderFilters((prev) => ({ ...prev, industry: v }))}
        />
      );
    }
    return undefined;
  };

  const filteredProspects = useMemo(() => {
    if (!prospects) return [];
    return prospects.filter((prospect) => {
      if (campaignFilter === "none") {
        if (prospect.campaign_id) return false;
      } else if (campaignFilter !== "all" && prospect.campaign_id !== campaignFilter) {
        return false;
      }
      const matchesStatus = statusFilter === "all" || prospect.status === statusFilter;
      if (!matchesStatus) return false;
      if (headerFilters.qualification !== "all" && (prospect as any).qualificationStatus !== headerFilters.qualification) return false;
      if (headerFilters.industry !== "all" && prospect.source !== headerFilters.industry) return false;
      const q = searchQuery.toLowerCase();
      const matchesSearch = !q ||
        `${prospect.first_name ?? ""} ${prospect.last_name ?? ""}`.toLowerCase().includes(q) ||
        (prospect.company ?? "").toLowerCase().includes(q) ||
        (prospect.phone ?? "").includes(q) ||
        (prospect.email ?? "").toLowerCase().includes(q);
      return matchesSearch;
    });
  }, [prospects, campaignFilter, statusFilter, headerFilters, searchQuery]);

  async function handleDelete() {
    if (!deleteConfirm) return;
    try {
      await api.prospects.delete(deleteConfirm.id);
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
      setDeleteConfirm(null);
      success("Prospect deleted", `${deleteConfirm.name} has been removed from the list`);
    } catch (err) {
      toastError("Error", "Failed to delete the prospect");
    }
  }

  async function handleStatusChange(prospectId: string, newStatus: string) {
    await api.prospects.update(prospectId, { status: newStatus as any });
    queryClient.invalidateQueries({ queryKey: ["prospects"] });
    success("Status updated", `Status changed to "${newStatus}"`);
  }

  async function handleCampaignChange(prospectId: string, campaignId: string | null) {
    try {
      await api.prospects.update(prospectId, { campaign_id: campaignId });
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
      const campaignName = campaignId ? (campaigns?.find(c => c.id === campaignId)?.name || campaignId) : "None";
      success("Campaign updated", `Campaign set to "${campaignName}"`);
    } catch (err) {
      toastError("Error", "Failed to update campaign");
    }
  }

  async function handleSyncFromTwenty() {
    setSyncing(true);
    try {
      const token = localStorage.getItem("cold-dialer-token");
      const res = await fetch("/api/sync/inbound", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      
      if (!res.ok) {
        throw new Error(`Sync failed (${res.status}): ${await res.text()}`);
      }
      
      await queryClient.invalidateQueries({ queryKey: ["prospects"] });
      success("Sync complete", "Prospects synced from Twenty");
    } catch (err: any) {
      toastError("Erreur de sync", err.message || "Impossible de synchroniser");
    } finally {
      setSyncing(false);
    }
  }

  async function handleBulkStatusChange(newStatus: string) {
    try {
      await Promise.all(Array.from(selectedIds).map(id =>
        api.prospects.update(id, { status: newStatus as any })
      ));
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
      success("Status updated", `${selectedIds.size} prospect(s) updated`);
    } catch (err) {
      toastError("Erreur", "Impossible de mettre à jour les prospects");
    }
  }

  async function handleBulkDelete() {
    try {
      await Promise.all(Array.from(selectedIds).map(id => api.prospects.delete(id)));
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
      success("Deleted", `${selectedIds.size} prospect(s) deleted`);
    } catch (err) {
      toastError("Error", "Failed to delete prospects");
    }
  }

  async function handleBulkEdit() {
    // Future: open a modal for batch edit
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredProspects.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredProspects.map(p => p.id)));
    }
  };

  const toggleRow = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const isAllSelected = filteredProspects.length > 0 && selectedIds.size === filteredProspects.length;

  return (
    <div className="flex flex-col h-full w-full select-none bg-[var(--ods-bg-primary)]">
      {/* Twenty-style Action Bar */}
      <div className="h-10 px-3 flex items-center justify-between border-b border-[var(--ods-border)] shrink-0">
        {selectedIds.size > 0 ? (
          <>
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-[var(--ods-text-primary)]">Prospects</span>
              <span className="text-[11px] font-medium text-[var(--ods-text-secondary)] px-1.5 py-0.5 rounded-[4px] bg-[var(--ods-bg-secondary)] border border-[var(--ods-border)]">
                {selectedIds.size} selected
              </span>
            </div>
            <RecordIndexCommandMenu
              selectedCount={selectedIds.size}
              onClear={() => setSelectedIds(new Set())}
              onDelete={handleBulkDelete}
              onEdit={handleBulkEdit}
            />
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-[var(--ods-text-primary)]">All Prospects</span>
              <span className="text-[11px] font-medium text-[var(--ods-text-secondary)] px-1.5 py-0.5 rounded-[4px] bg-[var(--ods-bg-secondary)] border border-[var(--ods-border)]">
                {filteredProspects.length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--ods-text-tertiary)] pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-7 pr-7 py-1 text-[12px] border border-[var(--ods-border)] rounded-[4px] bg-[var(--ods-bg-primary)] text-[var(--ods-text-primary)] placeholder:text-[var(--ods-text-tertiary)] outline-none focus:border-[var(--ods-brand-500)]"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--ods-text-tertiary)] hover:text-[var(--ods-text-primary)]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <StatusFilterDropdown
                value={statusFilter}
                options={statusOptions}
                onChange={setStatusFilter}
              />
              <ColumnVisibilityDropdown
                columns={columns}
                onChange={handleColumnToggle}
              />
              <button
                onClick={handleSyncFromTwenty}
                disabled={syncing}
                className="h-7 px-2.5 rounded-[6px] text-[12px] font-medium border border-[var(--ods-border)] text-[var(--ods-text-primary)] hover:bg-[var(--ods-bg-secondary)] transition-colors flex items-center gap-1 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
                Sync
              </button>
              <button
                onClick={() => setShowForm(true)}
                className="h-7 px-2.5 rounded-[6px] text-[12px] font-medium bg-[var(--ods-brand-600)] text-white hover:opacity-90 transition-opacity flex items-center gap-1"
              >
                + New prospect
              </button>
            </div>
          </>
        )}
      </div>

      {/* Campaign tabs */}
      <div className="px-3 py-1.5 flex items-center gap-1.5 border-b border-[var(--ods-border)] overflow-x-auto shrink-0">
        <CampaignTab
          label="All"
          count={campaignCounts.total}
          active={campaignFilter === "all"}
          onClick={() => setCampaignFilter("all")}
        />
        <CampaignTab
          label="Unassigned"
          count={campaignCounts.unassigned}
          active={campaignFilter === "none"}
          onClick={() => setCampaignFilter("none")}
        />
        {(campaigns ?? []).map((campaign) => (
          <CampaignTab
            key={campaign.id}
            label={campaign.name}
            count={campaignCounts.counts.get(campaign.id) ?? 0}
            active={campaignFilter === campaign.id}
            onClick={() => setCampaignFilter(campaign.id)}
          />
        ))}
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="ml-auto h-6 px-2 shrink-0 rounded-[4px] text-[11px] font-medium text-[var(--ods-text-secondary)] hover:text-[var(--ods-text-primary)] hover:bg-[var(--ods-bg-secondary)] flex items-center gap-1"
          >
            <X className="w-3 h-3" />
            Clear filters
          </button>
        )}
      </div>

      {/* Flush Full-Bleed Table */}
      <div className="flex-1 w-full overflow-auto">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToHorizontalAxis]}
          onDragStart={(e) => setActiveId(String(e.active.id))}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={clearDnD}
        >
        <table
          ref={tableRef}
          className="w-full border-collapse text-left table-fixed"
          style={tableVars}
        >
          <colgroup>
            <col style={{ width: 32 }} />
            {orderedColumns.map((c) => (
              <col key={c.key} style={{ width: `var(--col-${c.key})` }} />
            ))}
            <col style={{ width: 64 }} />
          </colgroup>
          <thead
            className="sticky top-0 bg-[var(--ods-bg-secondary)] z-10"
            onPointerMove={(e) => {
              pointerX.current = e.clientX;
            }}
          >
            <tr className="h-8 border-b border-[var(--ods-border)]">
              <th className="w-8 px-2 text-center border border-[var(--ods-border)]">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={toggleSelectAll}
                  className="rounded-[3px] border-[var(--ods-border)] accent-[var(--ods-brand-600)]"
                />
              </th>
              {nameCol && (
                <th className="relative px-3 text-[13px] font-medium text-[var(--ods-text-primary)] border border-[var(--ods-border)] bg-[var(--ods-bg-secondary)]">
                  <span className="inline-flex items-center">{nameCol.label}</span>
                  <ColumnResizeHandle
                    colKey="name"
                    tableRef={tableRef}
                    startWidth={widths.name ?? 200}
                    onResizeEnd={setWidth}
                  />
                </th>
              )}
              <SortableContext items={sortableKeys} strategy={horizontalListSortingStrategy}>
                {sortableKeys.map((key) => {
                  const col = orderedColumns.find((c) => c.key === key)!;
                  return (
                    <SortableHeaderCell
                      key={key}
                      colKey={key}
                      label={col.label}
                      widthVar={`--col-${key}`}
                      edge={overId === key ? edge : null}
                      registerHeader={registerHeader}
                      filter={headerFilterFor(key)}
                      resizeHandle={
                        <ColumnResizeHandle
                          colKey={key}
                          tableRef={tableRef}
                          startWidth={widths[key] ?? 120}
                          onResizeEnd={setWidth}
                        />
                      }
                    />
                  );
                })}
              </SortableContext>
              <th className="w-16 px-3 text-right text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-secondary)] border border-[var(--ods-border)]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--ods-border)]">
            {isLoading ? (
              <tr>
                <td colSpan={orderedColumns.length + 2} className="text-center py-8">
                  <Spokes className="h-8 w-8 text-[var(--ods-brand-600)] mx-auto" />
                </td>
              </tr>
            ) : prospects?.length === 0 ? (
              <tr>
                <td colSpan={orderedColumns.length + 2} className="text-center py-8 text-[13px] text-[var(--ods-text-secondary)]">
                  No prospects yet. Click "Sync" to import from Twenty.
                </td>
              </tr>
            ) : filteredProspects.length === 0 ? (
              <tr>
                <td colSpan={orderedColumns.length + 2} className="text-center py-8 text-[13px] text-[var(--ods-text-secondary)]">
                  No prospects match these filters.{" "}
                  <button onClick={clearFilters} className="text-[var(--ods-brand-600)] hover:underline font-medium">
                    Clear filters
                  </button>
                </td>
              </tr>
            ) : filteredProspects.map((prospect) => (
              <tr key={prospect.id} className={`h-8 transition-colors ${selectedIds.has(prospect.id) ? 'bg-[var(--ods-bg-secondary)]' : 'hover:bg-[var(--ods-bg-secondary)]'}`}>
                <td className="w-8 px-2 text-center border border-[var(--ods-border)]">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(prospect.id)}
                    onChange={() => toggleRow(prospect.id)}
                    className="rounded-[3px] border-[var(--ods-border)] accent-[var(--ods-brand-600)]"
                  />
                </td>
                {orderedColumns.map((col) => (
                  <React.Fragment key={col.key}>{renderProspectCell(col.key, prospect)}</React.Fragment>
                ))}
                <td className="w-16 px-3 text-right border border-[var(--ods-border)]">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => navigate(`/prospects/${prospect.id}`)}
                      className="p-1 text-[var(--ods-text-secondary)] hover:text-[var(--ods-brand-600)]"
                      title="Call"
                    >
                      <Phone className="w-3.5 h-3.5" />
                    </button>
                    {prospect.email && (
                      <a href={`mailto:${prospect.email}`} className="p-1 text-[var(--ods-text-secondary)] hover:text-[var(--ods-brand-600)]" title="Email">
                        <Mail className="w-3.5 h-3.5" />
                      </a>
                    )}
                    <ActionsMenu
                      leadId={prospect.id}
                      leadName={`${prospect.first_name} ${prospect.last_name}`}
                      onView={(id) => navigate(`/prospects/${id}`)}
                      onDelete={(id, name) => setDeleteConfirm({ id, name })}
                      data={prospect}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <DragOverlay dropAnimation={null}>
          {activeId ? (
            <div className="flex items-center gap-1.5 px-3 h-8 rounded-[6px] bg-white border border-[var(--ods-brand-600)] shadow-[0_8px_24px_rgba(0,0,0,0.18)] text-[13px] font-medium text-[var(--ods-text-primary)] cursor-grabbing whitespace-nowrap">
              {columns.find((c) => c.key === activeId)?.label ?? activeId}
            </div>
          ) : null}
        </DragOverlay>
        </DndContext>
      </div>

      {showForm && (
        <LeadForm
          onClose={() => setShowForm(false)}
          onSubmit={async (data) => {
            await api.prospects.create(data as any);
            queryClient.invalidateQueries({ queryKey: ["prospects"] });
            setShowForm(false);
            success("Prospect created", `${data.first_name} ${data.last_name} has been added`);
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleteConfirm}
        title="Delete Prospect"
        message={`Are you sure you want to delete "${deleteConfirm?.name}"? This action cannot be undone.`}
        variant="danger"
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
