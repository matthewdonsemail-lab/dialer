import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { StatusSelect } from "@/components/common/StatusSelect";
import { ColumnVisibilityDropdown, ColumnDef } from "@/components/common/ColumnVisibilityDropdown";
import { Spokes } from "@/components/ui/Spinner";
import { api } from "@/lib/apiClient";
import { mapCampaignStatusOptions } from "@/lib/twentyOptions";
import { Plus, Search, RefreshCw } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

type AgencyCampaign = {
  id: string;
  name?: string;
  status?: string; // Backend maps: active, paused, draft
  campaignType?: string; // From Twenty SELECT: OUTBOUND, INBOUND, etc.
  note?: string;
  createdAt?: string;
  updatedAt?: string;
};

type CampaignFormState = {
  name: string;
  status: string;
  campaignType: string;
};

const TYPE_BADGE_CLASSES: Record<string, string> = {
  outbound: "bg-blue-500/10 text-blue-700 border border-blue-500/20",
  inbound: "bg-emerald-500/10 text-emerald-700 border border-emerald-500/20",
  blended: "bg-purple-500/10 text-purple-700 border border-purple-500/20",
  referral: "bg-amber-500/10 text-amber-700 border border-amber-500/20",
  "cold-call": "bg-rose-500/10 text-rose-700 border border-rose-500/20",
  "cold_call": "bg-rose-500/10 text-rose-700 border border-rose-500/20",
  website: "bg-cyan-500/10 text-cyan-700 border border-cyan-500/20",
  "twenty-import": "bg-slate-500/10 text-slate-700 border border-slate-500/20",
  twenty_import: "bg-slate-500/10 text-slate-700 border border-slate-500/20",
  other: "bg-gray-500/10 text-gray-700 border border-gray-500/20",
};

function typeLabel(value: string | undefined): string {
  if (!value) return "Outbound";
  return value
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function typeClasses(value: string | undefined): string {
  return TYPE_BADGE_CLASSES[value ?? ""] || "bg-gray-500/10 text-gray-600 border border-gray-500/20";
}

export function CampaignPage() {
  const queryClient = useQueryClient();
  const { data: campaigns, isLoading } = useQuery<AgencyCampaign[]>({
    queryKey: ["campaigns"],
    queryFn: async () => api.campaigns.list(),
    staleTime: Infinity,
  });

  // Fetch status options dynamically from Twenty CRM
  const { data: meta } = useQuery<{ fields: Record<string, Array<{ label: string; value: string; color: string }>> }>({
    queryKey: ["twenty-meta", "agencyCampaigns"],
    queryFn: async () => api.twentyMeta.fields("agencyCampaigns"),
    staleTime: Infinity,
  });

  const statusOptions = meta?.fields["status"]
    ? mapCampaignStatusOptions(meta.fields["status"])
    : [];

  const { success, error: toastError } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<AgencyCampaign | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<AgencyCampaign | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [columns, setColumns] = useState<ColumnDef[]>([
    { key: 'name', label: 'Name', visible: true },
    { key: 'status', label: 'Status', visible: true },
    { key: 'type', label: 'Type', visible: true },
    { key: 'created', label: 'Created', visible: true },
  ]);

  const isVisible = (key: string) => columns.find(c => c.key === key)?.visible ?? true;

  const handleColumnToggle = (key: string, visible: boolean) => {
    setColumns(prev => prev.map(c => c.key === key ? { ...c, visible } : c));
  };

  const filtered = useMemo(() => {
    if (!campaigns) return [];
    return campaigns.filter((c) => {
      const matchesStatus = statusFilter === "all" || c.status === statusFilter;
      const q = searchQuery.toLowerCase();
      const matchesSearch = !q || (c.name ?? "").toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [campaigns, statusFilter, searchQuery]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.campaigns.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
  });

  const createOrUpdateMutation = useMutation({
    mutationFn: async (data: CampaignFormState & { id?: string }) => {
      if (data.id) {
        return api.campaigns.update(data.id, data);
      }
      return api.campaigns.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
  });

  async function handleDelete() {
    if (!deleteConfirm) return;
    await deleteMutation.mutateAsync(deleteConfirm.id);
    setDeleteConfirm(null);
    success("Campaign deleted", `"${deleteConfirm.name}" has been removed`);
  }

  async function handleSyncFromTwenty() {
    setSyncing(true);
    try {
      const token = localStorage.getItem("cold-dialer-token");
      const res = await fetch("/api/sync/campaigns", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        throw new Error(`Sync failed (${res.status}): ${await res.text()}`);
      }
      await queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      success("Sync complete", "Campaigns synced from Twenty");
    } catch (err: any) {
      toastError("Sync error", err.message || "Failed to sync");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex flex-col h-full w-full select-none bg-[var(--ods-bg-primary)]">
      {/* Twenty-style Action Bar */}
      <div className="h-10 px-3 flex items-center justify-between border-b border-[var(--ods-border)] shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-[var(--ods-text-primary)]">Campaigns</span>
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
              className="pl-7 pr-3 py-1 text-[12px] border border-[var(--ods-border)] rounded-[4px] bg-[var(--ods-bg-primary)] text-[var(--ods-text-primary)] placeholder:text-[var(--ods-text-tertiary)] outline-none focus:border-[var(--ods-brand-500)]"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2 py-1 text-[12px] border border-[var(--ods-border)] rounded-[4px] bg-[var(--ods-bg-primary)] text-[var(--ods-text-primary)] outline-none focus:border-[var(--ods-brand-500)] appearance-none cursor-pointer"
          >
            <option value="all">All</option>
            {statusOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <button
            onClick={handleSyncFromTwenty}
            disabled={syncing}
            className="h-7 px-2.5 rounded-[6px] text-[12px] font-medium border border-[var(--ods-border)] text-[var(--ods-text-primary)] hover:bg-[var(--ods-bg-secondary)] transition-colors flex items-center gap-1 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
            Sync
          </button>
          <ColumnVisibilityDropdown columns={columns} onChange={handleColumnToggle} />
          <button
            onClick={() => setShowForm(true)}
            className="h-7 px-2.5 rounded-[6px] text-[12px] font-medium bg-[var(--ods-brand-600)] text-white hover:opacity-90 transition-opacity flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            New Campaign
          </button>
        </div>
      </div>

      {/* Flush Full-Bleed Table */}
      <div className="flex-1 w-full overflow-auto">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 bg-[var(--ods-bg-secondary)] z-10">
            <tr className="h-8 border-b border-[var(--ods-border)]">
              <th className="px-3 text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-secondary)]">Name</th>
              {isVisible('status') && <th className="px-3 text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-secondary)]">Status</th>}
              {isVisible('type') && <th className="px-3 text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-secondary)]">Type</th>}
              {isVisible('created') && <th className="px-3 text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-secondary)]">Created</th>}
              <th className="w-16 px-3 text-right text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-secondary)]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--ods-border)]">
            {isLoading ? (
              <tr>
                <td colSpan={5} className="text-center py-8">
                  <Spokes className="h-8 w-8 text-[var(--ods-brand-600)] mx-auto" />
                </td>
              </tr>
            ) : campaigns?.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-8 text-[13px] text-[var(--ods-text-secondary)]">
                  No campaigns found. Click "Sync" to import from Twenty.
                </td>
              </tr>
            ) : filtered.map((campaign) => (
              <tr key={campaign.id} className="h-8 hover:bg-[var(--ods-bg-secondary)] transition-colors">
                <td className="px-3 text-[13px] font-medium text-[var(--ods-text-primary)] truncate max-w-[200px]">
                  {campaign.name || "Unnamed Campaign"}
                </td>
                {isVisible('status') && (
                  <td className="px-3">
                    <StatusSelect
                      value={campaign.status || "draft"}
                      options={statusOptions}
                      onChange={(v) => {
                        createOrUpdateMutation.mutateAsync({ id: campaign.id, name: campaign.name || "", status: v, campaignType: campaign.campaignType || "outbound" }).then(() => {
                          success("Status updated", `Status changed to "${v}"`);
                        });
                      }}
                    />
                  </td>
                )}
                {isVisible('type') && (
                  <td className="px-3">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-[4px] text-[11px] font-medium ${typeClasses(campaign.campaignType)}`}>
                      {typeLabel(campaign.campaignType)}
                    </span>
                  </td>
                )}
                {isVisible('created') && (
                  <td className="px-3 text-[13px] text-[var(--ods-text-secondary)]">
                    {campaign.createdAt ? new Date(campaign.createdAt).toLocaleDateString() : "—"}
                  </td>
                )}
                <td className="w-16 px-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => setEditingCampaign(campaign)}
                      className="p-1 text-[var(--ods-text-secondary)] hover:text-[var(--ods-brand-600)]"
                      title="Edit"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(campaign)}
                      className="p-1 text-[var(--ods-text-secondary)] hover:text-red-600"
                      title="Delete"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(showForm || editingCampaign) && (
        <CampaignModal
          campaign={editingCampaign}
          onClose={() => {
            setShowForm(false);
            setEditingCampaign(null);
          }}
          onSaved={() => {
            setShowForm(false);
            setEditingCampaign(null);
          }}
          statusOptions={statusOptions}
        />
      )}

      <ConfirmDialog
        open={!!deleteConfirm}
        title="Delete Campaign"
        message={`Delete "${deleteConfirm?.name}"? This cannot be undone.`}
        variant="danger"
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}

function CampaignModal({
  campaign,
  onClose,
  onSaved,
  statusOptions,
}: {
  campaign: AgencyCampaign | null;
  onClose: () => void;
  onSaved: () => void;
  statusOptions: Array<{ value: string; label: string; dotColor: string; bgTint: string; textColor: string }>;
}) {
  const queryClient = useQueryClient();
  const isEdit = !!campaign;

  const [form, setForm] = useState<CampaignFormState>({
    name: campaign?.name || "",
    status: campaign?.status || "draft",
    campaignType: campaign?.campaignType?.toLowerCase().replace("_", "-") || "outbound",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (data: CampaignFormState) => {
      if (isEdit && campaign) {
        return api.campaigns.update(campaign.id, data);
      }
      return api.campaigns.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      onSaved();
    },
    onError: (err: any) => {
      setError(err?.message || "Failed to save campaign");
    },
    onSettled: () => {
      setSaving(false);
    },
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Campaign name is required");
      return;
    }
    setSaving(true);
    setError(null);
    mutation.mutate(form);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[var(--ods-bg-primary)] rounded-[8px] p-5 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[14px] font-semibold">
            {isEdit ? "Edit Campaign" : "New Campaign"}
          </h3>
          <button
            onClick={onClose}
            className="text-[var(--ods-text-tertiary)] hover:text-[var(--ods-text-primary)] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[12px] font-medium text-[var(--ods-text-secondary)] mb-1.5">
              Campaign Name
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Enter campaign name"
              className="w-full px-3 py-2 text-[13px] border border-[var(--ods-border)] rounded-[4px] bg-[var(--ods-bg-primary)] text-[var(--ods-text-primary)] placeholder:text-[var(--ods-text-tertiary)] outline-none focus:border-[var(--ods-brand-500)]"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[var(--ods-text-secondary)] mb-1.5">
              Status
            </label>
            <StatusSelect
              value={form.status}
              options={statusOptions}
              onChange={(v) => setForm({ ...form, status: v })}
            />
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[var(--ods-text-secondary)] mb-1.5">
              Type / Campaign Source
            </label>
            <select
              value={form.campaignType}
              onChange={(e) => setForm({ ...form, campaignType: e.target.value })}
              className="w-full px-3 py-2 text-[13px] border border-[var(--ods-border)] rounded-[4px] bg-[var(--ods-bg-primary)] text-[var(--ods-text-primary)] outline-none focus:border-[var(--ods-brand-500)]"
            >
              {[
                { value: "outbound", label: "Outbound" },
                { value: "inbound", label: "Inbound" },
                { value: "blended", label: "Blended" },
                { value: "referral", label: "Referral" },
                { value: "cold-call", label: "Cold Call" },
                { value: "website", label: "Website" },
                { value: "twenty-import", label: "Twenty Import" },
                { value: "other", label: "Other" },
              ].map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {error && (
            <p className="text-[12px] text-red-500">{error}</p>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-[12px] bg-[var(--ods-bg-secondary)] border border-[var(--ods-border)] rounded-[4px] hover:bg-[var(--ods-border)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-3 py-1.5 text-[12px] font-medium text-white bg-[var(--ods-brand-600)] rounded-[4px] hover:bg-[var(--ods-brand-700)] transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : isEdit ? "Save Changes" : "Create Campaign"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
