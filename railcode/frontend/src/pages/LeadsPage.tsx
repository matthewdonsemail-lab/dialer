import React, { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useLeads } from "@/hooks/useLeads";
import { useCreateLead, useDeleteLead, useUpdateLead } from "@/hooks/useLeads";
import { StatusSelect } from "@/components/common/StatusSelect";
import { StatusFilterDropdown } from "@/components/common/StatusFilterDropdown";
import { mapLeadProspectStatusOptions } from "@/lib/twentyOptions";
import { RecordIndexCommandMenu } from "@/components/common/RecordIndexCommandMenu";
import { ColumnVisibilityDropdown, ColumnDef } from "@/components/common/ColumnVisibilityDropdown";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { LeadForm } from "@/components/leads/LeadForm";
import { useToast } from "@/components/ui/Toast";
import { Mail, Phone, Search, X } from "lucide-react";
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
import { ActionsMenu } from "@/components/common/ActionsMenu";
import { CampaignSelect } from "@/components/common/CampaignSelect";
import { HeaderFilter } from "@/components/common/HeaderFilter";
import { api } from "@/lib/apiClient";
import { useQuery } from "@tanstack/react-query";

type StatusFilter = string | "all";

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

export function LeadsPage() {
  const navigate = useNavigate();
  const { data: leads, isLoading } = useLeads();
  const createLead = useCreateLead();
  const updateLead = useUpdateLead();
  const deleteLead = useDeleteLead();
  const { success, error: toastError } = useToast();

  // Fetch status options from Twenty CRM
  const { data: meta } = useQuery<{ fields: Record<string, Array<{ label: string; value: string; color: string }>> }>({
    queryKey: ["twenty-meta", "agencyLeads"],
    queryFn: async () => api.twentyMeta.fields("agencyLeads"),
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
  const [actionsMenuId, setActionsMenuId] = useState<string | null>(null);
  const actionsMenuRef = useRef<HTMLDivElement>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { columns, setColumns } = useColumnOrder('leads-column-order', [
    { key: 'name', label: 'Name', visible: true },
    { key: 'company', label: 'Company', visible: true },
    { key: 'phone', label: 'Phone', visible: true },
    { key: 'status', label: 'Status', visible: true },
    { key: 'state', label: 'State', visible: true },
    { key: 'city', label: 'City', visible: true },
    { key: 'qualification', label: 'Qualification', visible: true },
    { key: 'last_called', label: 'Last Called', visible: true },
    { key: 'type', label: 'Industry', visible: true },
    { key: 'campaign', label: 'Campaign', visible: true },
  ], 'name');
  const orderedColumns = columns.filter((c) => c.visible);
  const nameCol = orderedColumns.find((c) => c.key === 'name');
  const sortableKeys = orderedColumns.filter((c) => c.key !== 'name').map((c) => c.key);

  const { widths, setWidth } = useColumnWidths('leads-column-widths', {
    name: 200, company: 180, phone: 130, status: 140, state: 120, city: 140,
    qualification: 130, last_called: 130, type: 130, campaign: 150,
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

  // Facet counts for tabs + header filter popovers (computed over full dataset)
  const campaignCounts = useMemo(() => {
    const counts = new Map<string, number>();
    let unassigned = 0;
    for (const l of leads ?? []) {
      if ((l as any).campaign_id) counts.set((l as any).campaign_id, (counts.get((l as any).campaign_id) ?? 0) + 1);
      else unassigned++;
    }
    return { counts, unassigned, total: leads?.length ?? 0 };
  }, [leads]);

  const facetOptions = useMemo(() => {
    const qualification = new Map<string, number>();
    const industry = new Map<string, number>();
    for (const l of leads ?? []) {
      const q = (l as any).qualificationStatus as string | undefined;
      if (q) qualification.set(q, (qualification.get(q) ?? 0) + 1);
      if ((l as any).source) industry.set((l as any).source, (industry.get((l as any).source) ?? 0) + 1);
    }
    const toOptions = (m: Map<string, number>) =>
      [...m.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([value, count]) => ({ value, label: value, count }));
    return { qualification: toOptions(qualification), industry: toOptions(industry) };
  }, [leads]);

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

  const filteredLeads = useMemo(() => {
    if (!leads) return [];
    return leads.filter((lead) => {
      const cid = (lead as any).campaign_id;
      if (campaignFilter === "none") {
        if (cid) return false;
      } else if (campaignFilter !== "all" && cid !== campaignFilter) {
        return false;
      }
      const matchesStatus = statusFilter === "all" || lead.status === statusFilter;
      if (!matchesStatus) return false;
      if (headerFilters.qualification !== "all" && (lead as any).qualificationStatus !== headerFilters.qualification) return false;
      if (headerFilters.industry !== "all" && (lead as any).source !== headerFilters.industry) return false;
      const q = searchQuery.toLowerCase();
      const matchesSearch = !q ||
        `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.toLowerCase().includes(q) ||
        (lead.company ?? "").toLowerCase().includes(q) ||
        (lead.phone ?? "").includes(q) ||
        (lead.email ?? "").toLowerCase().includes(q);
      return matchesSearch;
    });
  }, [leads, campaignFilter, statusFilter, headerFilters, searchQuery]);

  async function handleDelete() {
    if (!deleteConfirm) return;
    try {
      await deleteLead.mutateAsync(deleteConfirm.id);
      setDeleteConfirm(null);
      success("Lead deleted", `${deleteConfirm.name} has been removed`);
    } catch (err) {
      toastError("Error", "Failed to delete the lead");
    }
  }

  async function handleStatusChange(leadId: string, newStatus: string) {
    await updateLead.mutateAsync({ id: leadId, status: newStatus as any });
    success("Status updated", `Status changed to "${newStatus}"`);
  }

  async function handleCampaignChange(leadId: string, campaignId: string | null) {
    try {
      await api.leads.update(leadId, { campaign_id: campaignId });
      success("Campaign updated", `Campaign set to "${campaignId ? campaigns?.find(c => c.id === campaignId)?.name || campaignId : "—"}"`);
    } catch (err) {
      toastError("Error", "Failed to update campaign");
    }
  }

  async function handleBulkDelete() {
    try {
      await Promise.all(Array.from(selectedIds).map(id => deleteLead.mutateAsync(id)));
      setSelectedIds(new Set());
      success("Deleted", `${selectedIds.size} lead(s) deleted`);
    } catch (err) {
      toastError("Error", "Failed to delete the leads");
    }
  }

  async function handleBulkEdit() {
    // Future: open a modal for batch edit
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredLeads.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredLeads.map(l => l.id)));
    }
  };

  const toggleRow = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const isAllSelected = filteredLeads.length > 0 && selectedIds.size === filteredLeads.length;

  const cellBorder = "border border-[var(--ods-border)]";

  function renderLeadCell(key: string, lead: any) {
    switch (key) {
      case 'name':
        return (
          <td className={`${cellBorder} px-3 text-[13px] font-medium text-[var(--ods-text-primary)] truncate max-w-[200px] cursor-pointer hover:text-[var(--ods-brand-600)]`} onClick={() => navigate(`/leads/${lead.id}`)}>
            {lead.first_name} {lead.last_name}
          </td>
        );
      case 'company':
        return (
          <td className={`${cellBorder} px-3 text-[13px] text-[var(--ods-text-secondary)] truncate max-w-[180px]`}>{lead.company ?? "—"}</td>
        );
      case 'phone':
        return (
          <td className={`${cellBorder} px-3 text-[13px] text-[var(--ods-text-secondary)] font-mono`}>{lead.phone ?? "—"}</td>
        );
      case 'status':
        return (
          <td className={`${cellBorder} px-3`}>
            <StatusSelect
              value={lead.status}
              options={statusOptions}
              onChange={(newStatus) => handleStatusChange(lead.id, newStatus)}
            />
          </td>
        );
      case 'state':
        return (
          <td className={`${cellBorder} px-3 text-[13px] text-[var(--ods-text-secondary)] truncate max-w-[160px]`}>{(lead as any).state ?? "—"}</td>
        );
      case 'city':
        return (
          <td className={`${cellBorder} px-3 text-[13px] text-[var(--ods-text-secondary)] truncate max-w-[160px]`}>{(lead as any).city ?? "—"}</td>
        );
      case 'qualification':
        return (
          <td className={`${cellBorder} px-3`}>
            {(lead as any).qualificationStatus ? (
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-[4px] text-[11px] font-medium border ${ (lead as any).qualificationStatus === 'QUALIFIED' ? 'bg-green-500/10 text-green-700 border-green-200' : (lead as any).qualificationStatus === 'DISQUALIFIED' ? 'bg-red-500/10 text-red-700 border-red-200' : 'bg-gray-500/10 text-gray-600 border-gray-200'}`}>
                {(lead as any).qualificationStatus}
              </span>
            ) : (
              <span className="text-[11px] text-[var(--ods-text-tertiary)]">—</span>
            )}
          </td>
        );
      case 'last_called':
        return (
          <td className={`${cellBorder} px-3 text-[13px] text-[var(--ods-text-secondary)]`}>
            {lead.last_called_at ? new Date(lead.last_called_at).toLocaleDateString() : "—"}
          </td>
        );
      case 'type':
        return (
          <td className={`${cellBorder} px-3`}>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-[4px] text-[11px] font-medium bg-[var(--ods-bg-secondary)] border border-[var(--ods-border)] text-[var(--ods-text-primary)]">
              {lead.source || "—"}
            </span>
          </td>
        );
      case 'campaign':
        return (
          <td className={`${cellBorder} px-3`}>
            <CampaignSelect
              campaigns={campaigns}
              value={lead.campaign_id}
              onChange={(campaignId) => handleCampaignChange(lead.id, campaignId)}
            />
          </td>
        );
      default:
        return null;
    }
  }

  return (
    <div className="flex flex-col h-full w-full select-none bg-[var(--ods-bg-primary)]">
      {/* Twenty-style Action Bar */}
      <div className="h-10 px-3 flex items-center justify-between border-b border-[var(--ods-border)] shrink-0">
        {selectedIds.size > 0 ? (
          <>
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-[var(--ods-text-primary)]">Leads</span>
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
              <span className="text-[13px] font-semibold text-[var(--ods-text-primary)]">All Leads</span>
              <span className="text-[11px] font-medium text-[var(--ods-text-secondary)] px-1.5 py-0.5 rounded-[4px] bg-[var(--ods-bg-secondary)] border border-[var(--ods-border)]">
                {filteredLeads.length}
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
                onClick={() => setShowForm(true)}
                className="h-7 px-2.5 rounded-[6px] text-[12px] font-medium bg-[var(--ods-brand-600)] text-white hover:opacity-90 transition-opacity flex items-center gap-1"
              >
                + New lead
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
            {leads?.length === 0 ? (
              <tr>
                <td colSpan={orderedColumns.length + 2} className="text-center py-8 text-[13px] text-[var(--ods-text-secondary)]">
                  No leads yet
                </td>
              </tr>
            ) : filteredLeads.length === 0 ? (
              <tr>
                <td colSpan={orderedColumns.length + 2} className="text-center py-8 text-[13px] text-[var(--ods-text-secondary)]">
                  No leads match these filters.{" "}
                  <button onClick={clearFilters} className="text-[var(--ods-brand-600)] hover:underline font-medium">
                    Clear filters
                  </button>
                </td>
              </tr>
            ) : filteredLeads.map((lead) => (
              <tr key={lead.id} className={`h-8 transition-colors ${selectedIds.has(lead.id) ? 'bg-[var(--ods-bg-secondary)]' : 'hover:bg-[var(--ods-bg-secondary)]'}`}>
                <td className="w-8 px-2 text-center border border-[var(--ods-border)]">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(lead.id)}
                    onChange={() => toggleRow(lead.id)}
                    className="rounded-[3px] border-[var(--ods-border)] accent-[var(--ods-brand-600)]"
                  />
                </td>
                {orderedColumns.map((col) => (
                  <React.Fragment key={col.key}>{renderLeadCell(col.key, lead)}</React.Fragment>
                ))}
                <td className="w-16 px-3 text-right border border-[var(--ods-border)]">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => navigate(`/leads/${lead.id}`)}
                      className="p-1 text-[var(--ods-text-secondary)] hover:text-[var(--ods-brand-600)]"
                      title="Call"
                    >
                      <Phone className="w-3.5 h-3.5" />
                    </button>
                    {lead.email && (
                      <a href={`mailto:${lead.email}`} className="p-1 text-[var(--ods-text-secondary)] hover:text-[var(--ods-brand-600)]" title="Email">
                        <Mail className="w-3.5 h-3.5" />
                      </a>
                    )}
                    <ActionsMenu
                      leadId={lead.id}
                      leadName={`${lead.first_name} ${lead.last_name}`}
                      onView={(id) => navigate(`/leads/${id}`)}
                      onDelete={(id, name) => setDeleteConfirm({ id, name })}
                      data={lead}
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
            await createLead.mutateAsync(data as any);
            setShowForm(false);
            success("Lead created", `${data.first_name} ${data.last_name} has been added`);
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleteConfirm}
        title="Delete Lead"
        message={`Are you sure you want to delete "${deleteConfirm?.name}"? This action cannot be undone.`}
        variant="danger"
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
