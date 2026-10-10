import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, PhoneCall, RefreshCw } from "@/components/ui/icons";
import { api } from "@/lib/api-client";
import { StatusSelect } from "@/components/common/StatusSelect";
import { StatusFilterDropdown } from "@/components/common/StatusFilterDropdown";
import { mapLeadProspectStatusOptions } from "@/lib/twenty/options";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { LeadForm } from "@/components/leads/LeadForm";
import { useToast } from "@/components/ui/Toast";
import { ActionsMenu } from "@/components/common/ActionsMenu";
import { TwentyFieldLink } from "@/components/common/TwentyFieldLink";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { useDeleteProspect, useUpdateProspect } from "@/hooks/use-prospects";
import { isBottomStatus } from "@/lib/list-sort";
import { DataTable, ToolbarButton, useDataTable, type DataColumn } from "@/components/table";
import { CampaignModal } from "@/components/campaigns/CampaignModal";
import { defaultCampaignName, useCreateCallCampaign } from "@/hooks/use-call-campaigns";
import { usePowerDialer } from "@/components/campaigns/PowerDialer";
import type { CallCampaign } from "@/lib/api-client";

/** Display country for a prospect; blanks group under "Unknown". */
function countryOf(p: { country?: string }): string {
  const c = (p.country ?? "").trim();
  return c || "Unknown";
}

/** Table column key -> ACTUAL Twenty agencyProspects field (null = object page). */
const PROSPECT_FIELD_FOR_KEY: Record<string, string | null> = {
  name: "name",
  company: "niche",
  phone: "phone",
  status: "coldCallStatus",
  state: "region",
  city: "city",
  qualification: null,
  type: "niche",
};

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

export function ProspectPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { success, error: toastError } = useToast();

  const { data: prospects, isLoading } = useQuery<Prospect[]>({
    queryKey: ["prospects"],
    queryFn: async () => api.prospects.list(),
    staleTime: Infinity,
  });

  // Status options come from Twenty CRM
  const { data: meta } = useQuery<{ fields: Record<string, Array<{ label: string; value: string; color: string }>> }>({
    queryKey: ["twenty-meta", "agencyProspects"],
    queryFn: async () => api.twentyMeta.fields("agencyProspects"),
    staleTime: Infinity,
  });
  const statusOptions = meta?.fields["coldCallStatus"]
    ? mapLeadProspectStatusOptions(meta.fields["coldCallStatus"])
    : [];


  const updateProspect = useUpdateProspect();
  const deleteProspect = useDeleteProspect();
  const table = useDataTable("prospects");
  const [statusFilter, setStatusFilter] = usePersistedState<string>("prospects-filter-status", "all");
  const [countryFilter, setCountryFilter] = usePersistedState<string>("prospects-filter-country", "all");
  const [showForm, setShowForm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  // Call campaigns (WAVV-style): the phone button opens them; with contacts
  // selected it first creates a campaign from the selection.
  const [campaignModal, setCampaignModal] = useState<{ open: boolean; campaignId?: string | null }>({ open: false });
  const createCampaign = useCreateCallCampaign();
  const powerDialer = usePowerDialer();

  // Status-style options for the country dropdown (label shows the count).
  const countryOptions = useMemo(() => {
    const country = new Map<string, number>();
    for (const p of prospects ?? []) country.set(countryOf(p), (country.get(countryOf(p)) ?? 0) + 1);
    return [...country.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({
        value,
        label: `${value} (${count})`,
        dotColor: "bg-[var(--ods-text-tertiary)]",
        bgTint: "",
        textColor: "",
      }));
  }, [prospects]);

  const clearPageFilters = () => {
    setStatusFilter("all");
    setCountryFilter("all");
  };

  const pageFilter = (p: Prospect) => {
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (countryFilter !== "all" && countryOf(p) !== countryFilter) return false;
    return true;
  };

  async function handleDelete() {
    if (!deleteConfirm) return;
    try {
      setDeleteConfirm(null);
      await deleteProspect.mutateAsync(deleteConfirm.id);
      success("Contact deleted", `${deleteConfirm.name} has been removed from the list`);
    } catch {
      toastError("Error", "Failed to delete the contact");
    }
  }

  async function handleStatusChange(prospectId: string, newStatus: string) {
    try {
      await updateProspect.mutateAsync({ id: prospectId, patch: { status: newStatus } });
    } catch {
      toastError("Status not saved", "The change was undone. Try again.");
    }
  }


  async function handleSyncFromTwenty() {
    // No sync endpoint exists (reads are live from Twenty) — refetch instead.
    setSyncing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ["prospects"] });
      success("Sync complete", "Contacts refreshed from Twenty");
    } catch (err: any) {
      toastError("Sync error", err.message || "Failed to sync");
    } finally {
      setSyncing(false);
    }
  }

  async function handleBulkDelete(ids: string[]) {
    try {
      await deleteProspect.mutateAsync(ids);
      success("Deleted", `${ids.length} contact(s) deleted`);
    } catch {
      toastError("Error", "Failed to delete contacts");
    }
  }

  /** Selected contacts -> new campaign named after the current date and time, shown in the campaign window. */
  async function startCampaignFrom(ids: string[], clearSelection: () => void) {
    try {
      const created = await createCampaign.mutateAsync({ contactIds: ids, name: defaultCampaignName() });
      clearSelection();
      setCampaignModal({ open: true, campaignId: created.id });
    } catch (err: any) {
      toastError("Campaign not created", err?.message || "Try again.");
    }
  }

  /** Power dial: the floating dialer starts on top of this page; the screen stays put. */
  function startDialing(campaign: CallCampaign) {
    setCampaignModal({ open: false });
    powerDialer.start(campaign);
  }

  const open = (p: Prospect) => navigate(`/contacts/${p.id}`);
  const fieldLink = (key: string) => (
    <TwentyFieldLink objectName="agencyProspects" fieldName={PROSPECT_FIELD_FOR_KEY[key] ?? null} />
  );
  const statusLabel = (value?: string) => statusOptions.find((o) => o.value === value)?.label ?? value;

  const columns: DataColumn<Prospect>[] = [
    {
      key: "name",
      label: "Name",
      type: "title",
      width: 210,
      value: (p) => `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(),
      onClick: open,
      headerExtra: fieldLink("name"),
    },
    { key: "company", label: "Company", type: "text", width: 150, value: (p) => p.company, onClick: open, headerExtra: fieldLink("company") },
    { key: "phone", label: "Phone", type: "phone", width: 175, value: (p) => p.phone, onClick: open, headerExtra: fieldLink("phone") },
    {
      key: "status",
      label: "Status",
      type: "status",
      value: (p) => p.status,
      text: (p) => statusLabel(p.status),
      render: (p) => (
        <StatusSelect value={p.status} options={statusOptions} onChange={(s) => handleStatusChange(p.id, s)} />
      ),
      headerExtra: fieldLink("status"),
    },
    { key: "state", label: "State", type: "text", width: 110, value: (p) => p.state, headerExtra: fieldLink("state") },
    { key: "city", label: "City", type: "text", width: 120, value: (p) => p.city, headerExtra: fieldLink("city") },
    {
      key: "qualification",
      label: "Qualification",
      type: "badge",
      width: 105,
      value: (p) => (p as any).qualificationStatus,
      tone: (p) => {
        const q = (p as any).qualificationStatus;
        return q === "QUALIFIED" ? "green" : q === "DISQUALIFIED" ? "red" : "neutral";
      },
      filterable: true,
      headerExtra: fieldLink("qualification"),
    },
    { key: "type", label: "Industry", type: "badge", width: 130, value: (p) => p.source, filterable: true, headerExtra: fieldLink("type") },
  ];

  return (
    <>
      <DataTable
        state={table}
        title="All Contacts"
        columns={columns}
        rows={prospects}
        loading={isLoading}
        getRowId={(p) => p.id}
        filter={pageFilter}
        searchText={(p) => `${p.email ?? ""} ${countryOf(p)}`}
        isBottom={(p) => isBottomStatus(p.status, statusOptions)}
        onClearFilters={clearPageFilters}
        selection={{
          onDelete: handleBulkDelete,
          actions: (ids, clear) => (
            <ToolbarButton primary onClick={() => startCampaignFrom(ids, clear)} disabled={createCampaign.isPending}>
              <PhoneCall className="w-3.5 h-3.5" />
              {createCampaign.isPending ? "Creating campaign…" : `Dial ${ids.length} selected`}
            </ToolbarButton>
          ),
        }}
        emptyMessage='No contacts yet. Click "Sync" to import from Twenty.'
        filters={
          <>
            <StatusFilterDropdown value={statusFilter} options={statusOptions} onChange={setStatusFilter} />
            <StatusFilterDropdown
              value={countryFilter}
              options={countryOptions}
              onChange={setCountryFilter}
              label="Country"
              allLabel="All countries"
            />
          </>
        }
        actions={
          <>
            <ToolbarButton onClick={() => setCampaignModal({ open: true })}>
              <PhoneCall className="w-3.5 h-3.5" />
              Campaigns
            </ToolbarButton>
            <ToolbarButton onClick={handleSyncFromTwenty} disabled={syncing}>
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
              Sync
            </ToolbarButton>
            <ToolbarButton primary onClick={() => setShowForm(true)}>
              + New contact
            </ToolbarButton>
          </>
        }
        rowActions={(p) => (
          <>
            {p.email && (
              <a href={`mailto:${p.email}`} className="p-1 text-[var(--ods-text-secondary)] hover:text-[var(--ods-brand-600)]" title="Email">
                <Mail className="w-3.5 h-3.5" />
              </a>
            )}
            <ActionsMenu
              leadId={p.id}
              leadName={`${p.first_name} ${p.last_name}`}
              onView={(id) => navigate(`/contacts/${id}`)}
              onDelete={(id, name) => setDeleteConfirm({ id, name })}
              data={p}
            />
          </>
        )}
      />

      <CampaignModal
        open={campaignModal.open}
        initialCampaignId={campaignModal.campaignId}
        contacts={prospects ?? []}
        onClose={() => setCampaignModal({ open: false })}
        onStartDialing={startDialing}
      />

      {showForm && (
        <LeadForm
          onClose={() => setShowForm(false)}
          onSubmit={async (data) => {
            await api.prospects.create(data as any);
            queryClient.invalidateQueries({ queryKey: ["prospects"] });
            setShowForm(false);
            success("Contact created", `${data.first_name} ${data.last_name} has been added`);
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleteConfirm}
        title="Delete Contact"
        message={`Are you sure you want to delete "${deleteConfirm?.name}"? This action cannot be undone.`}
        variant="danger"
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(null)}
      />
    </>
  );
}
