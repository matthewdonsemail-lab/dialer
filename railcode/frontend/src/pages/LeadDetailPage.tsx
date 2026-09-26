import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useLead } from "@/hooks/useLeads";
import { useCallsForRecord } from "@/hooks/useCallLogs";
import { useUpdateLead, useDeleteLead } from "@/hooks/useLeads";
import { Softphone } from "@/components/softphone/Softphone";
import { CallScriptWidget } from "@/components/scripts/CallScriptWidget";
import { StatusBadge } from "@/components/common/StatusBadge";
import { StatusSelect } from "@/components/common/StatusSelect";
import { mapLeadProspectStatusOptions } from "@/lib/twentyOptions";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { PageCanvas } from "@/components/common/PageCanvas";
import { WidgetCard } from "@/components/ui/WidgetCard";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { ArrowLeft, Edit3, Trash2, Phone, Mail, Globe, MapPin } from "lucide-react";
import { Spokes } from "@/components/ui/Spinner";
import { CountryBadge } from "@/components/common/CountryBadge";
import { api } from "@/lib/apiClient";
import { useAuth } from "@/components/auth/AuthProvider";
import { useQueryClient } from "@tanstack/react-query";

export function LeadDetailPage() {
  const { leadId } = useParams<{ leadId: string }>();
  const navigate = useNavigate();
  const { success, error: toastError } = useToast();
  const { data: lead, isLoading } = useLead(leadId ?? "");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const member = user ? { id: user.twentyUserId ?? user.id, email: user.email } : null;
  const recentCalls = useCallsForRecord({ leadId: leadId ?? null });

  // Default sending number for leads (first ACTIVE row; claim enforced server-side)
  // Default sending number (shared ["twentyPhones"] cache: holder state stays live)
  const { data: phones } = useQuery({
    queryKey: ["twentyPhones"],
    queryFn: async () => api.twentyPhones.list(),
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
  const defaultPhoneRow =
    (phones ?? []).find((p: any) => p.state === "ACTIVE" && (p.callState || "IDLE") === "IDLE") ??
    (phones ?? []).find((p: any) => p.state === "ACTIVE") ??
    null;

  // Fetch campaigns to resolve campaign_id to name
  const { data: campaigns } = useQuery({
    queryKey: ["campaigns"],
    queryFn: async () => api.campaigns.list(),
    staleTime: Infinity,
  });

  const campaignName = campaigns?.find(c => c.id === lead?.campaign_id)?.name;

  // Fetch status options from Twenty CRM
  const { data: meta } = useQuery<{ fields: Record<string, Array<{ label: string; value: string; color: string }>> }>({
    queryKey: ["twenty-meta", "agencyLeads"],
    queryFn: async () => api.twentyMeta.fields("agencyLeads"),
    staleTime: Infinity,
  });

  const statusOptions = meta?.fields["coldCallStatus"]
    ? mapLeadProspectStatusOptions(meta.fields["coldCallStatus"])
    : [];

  const updateLeadMutation = useUpdateLead();
  const deleteLeadMutation = useDeleteLead();

  function handleCallEnd(data: { outcome: string; duration: number; notes: string; direction: "outbound" | "inbound"; recordingUrl?: string | null; callId?: string | null }) {
    // Call row is already logged to agencyCalls by the Softphone (with recording).
    queryClient.invalidateQueries({ queryKey: ["calls"] });
    queryClient.invalidateQueries({ queryKey: ["twenty-phones"] });

    // Update lead status based on call outcome
    const statusMap: Record<string, string> = {
      answered: "contacted",
      busy: "callback",
      voicemail: "callback",
      dnc: "do_not_contact",
      no_answer: "callback",
      wrong_number: "not_interested",
      disconnected: "callback",
    };
    const newStatus = statusMap[data.outcome];
    if (newStatus && lead) {
      updateLeadMutation.mutateAsync({ id: lead.id, status: newStatus as any });
    }
  }

  async function handleDelete() {
    if (!lead) return;
    try {
      await deleteLeadMutation.mutateAsync(lead.id);
      success("Lead deleted", `${lead.first_name} ${lead.last_name} has been removed`);
      navigate("/leads");
    } catch {
      toastError("Error", "Failed to delete the lead");
    }
  }

  async function handleStatusChange(newStatus: string) {
    if (!lead) return;
    try {
      await updateLeadMutation.mutateAsync({ id: lead.id, status: newStatus as any });
      success("Status updated", `Status changed to "${newStatus}"`);
    } catch {
      toastError("Error", "Failed to update status");
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spokes className="h-8 w-8 text-[var(--ods-brand-600)]" />
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="text-center py-12">
        <p className="text-[13px] text-[var(--ods-text-secondary)]">Lead not found</p>
        <button
          onClick={() => navigate("/leads")}
          className="mt-4 text-[13px] text-[var(--ods-brand-600)] hover:text-[var(--ods-brand-700)]"
        >
          Back to Leads
        </button>
      </div>
    );
  }

  const locationLine = [lead.city, lead.state, lead.zip].filter(Boolean).join(" ");

  return (
    <PageCanvas
      title={
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/leads")}
            aria-label="Back to leads"
            className="p-1 -ml-1 text-[var(--ods-text-tertiary)] hover:text-[var(--ods-text-primary)] rounded-ods-sm hover:bg-[var(--ods-bg-secondary)] transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <span>
            {lead.first_name} {lead.last_name}
          </span>
          <StatusBadge status={lead.status} />
          <CountryBadge country={(lead as any).country} />
        </div>
      }
      subtitle={`${lead.company ?? "No company"}${locationLine ? ` · ${locationLine}` : ""}`}
      actions={
        <>
          <Button variant="ghost" size="sm" onClick={() => setShowEdit(true)} title="Edit" aria-label="Edit lead">
            <Edit3 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowDeleteConfirm(true)} title="Delete" aria-label="Delete lead">
            <Trash2 className="w-4 h-4" />
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-[var(--ods-sp-6)]">
        {/* Main Dialing Row: Softphone + Call Script + Lead Details */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-[var(--ods-sp-6)] items-stretch">
          <Softphone
            lead={lead}
            phoneId={defaultPhoneRow?.id ?? null}
            member={member}
            leadId={leadId ?? null}
            onCallEnd={handleCallEnd}
          />
          <CallScriptWidget campaignId={lead.campaign_id ?? null} />
          <WidgetCard title="Lead Details">
            <div className="flex flex-col gap-[var(--ods-sp-4)]">
              {/* Status with StatusSelect */}
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-tertiary)] mb-2">
                  Status
                </dt>
                <StatusSelect
                  value={lead.status}
                  options={statusOptions}
                  onChange={handleStatusChange}
                />
              </div>

              {/* Qualification */}
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-tertiary)] mb-2">
                  Qualification
                </dt>
                {(lead as any).qualificationStatus ? (
                  <Badge variant={(lead as any).qualificationStatus === 'QUALIFIED' ? 'green' : (lead as any).qualificationStatus === 'DISQUALIFIED' ? 'rose' : 'gray'}>
                    {(lead as any).qualificationStatus}
                  </Badge>
                ) : (
                  <span className="text-[11px] text-[var(--ods-text-tertiary)]">—</span>
                )}
              </div>

              {/* Industry Badge */}
              {lead.source && (
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-tertiary)] mb-2">
                    Industry
                  </dt>
                  <Badge variant="indigo">{lead.source}</Badge>
                </div>
              )}

              {/* Campaign Badge */}
              {lead.campaign_id && (
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-tertiary)] mb-2">
                    Campaign
                  </dt>
                  <Badge variant="blue">{campaignName || lead.campaign_id.substring(0, 8) + "..."}</Badge>
                </div>
              )}

              <dl className="flex flex-col gap-[var(--ods-sp-3)]">
                {[
                  ["Company", lead.company ?? "—"],
                  ["Phone", lead.phone ?? "—"],
                  ["Email", lead.email ?? "—"],
                  ["Website", lead.website ?? "—"],
                  ["Address", lead.address ?? "—"],
                  ["City", locationLine || "—"],
                  ["Country", (lead as any).country ?? "—"],
                  ["Calls", String(lead.call_count ?? 0)],
                  ["Last Called", lead.last_called_at ? new Date(lead.last_called_at).toLocaleString() : "Never"],
                  ["Created", new Date(lead.created_at).toLocaleDateString()],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-tertiary)]">
                      {label}
                    </dt>
                    <dd className="text-[13px] text-[var(--ods-text-primary)] mt-0.5">{value as string}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </WidgetCard>
        </div>

        {/* Bottom Row: Notes | Contact Info | Recent Calls */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-[var(--ods-sp-6)]">
          <WidgetCard title="Notes">
            <p className="text-[13px] text-[var(--ods-text-secondary)] whitespace-pre-wrap">
              {lead.notes ?? "No notes yet"}
            </p>
          </WidgetCard>
          <WidgetCard title="Contact Info">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--ods-sp-3)]">
              {lead.phone && (
                <div className="flex items-center gap-2 text-[13px]">
                  <Phone className="w-4 h-4 text-[var(--ods-text-tertiary)]" />
                  <a href={`tel:${lead.phone}`} className="text-[var(--ods-text-secondary)] hover:text-[var(--ods-brand-600)]" target="_blank" rel="noopener noreferrer">
                    {lead.phone}
                  </a>
                </div>
              )}
              {lead.email && (
                <div className="flex items-center gap-2 text-[13px]">
                  <Mail className="w-4 h-4 text-[var(--ods-text-tertiary)]" />
                  <a href={`mailto:${lead.email}`} className="text-[var(--ods-text-secondary)] hover:text-[var(--ods-brand-600)]" target="_blank" rel="noopener noreferrer">
                    {lead.email}
                  </a>
                </div>
              )}
              {lead.website && (
                <div className="flex items-center gap-2 text-[13px]">
                  <Globe className="w-4 h-4 text-[var(--ods-text-tertiary)]" />
                  <a href={lead.website} className="text-[var(--ods-text-secondary)] hover:text-[var(--ods-brand-600)]" target="_blank" rel="noopener noreferrer">
                    {lead.website}
                  </a>
                </div>
              )}
              {(lead.address || lead.city || lead.state || lead.zip) && (
                <div className="flex items-center gap-2 text-[13px]">
                  <MapPin className="w-4 h-4 text-[var(--ods-text-tertiary)]" />
                  <span className="text-[var(--ods-text-secondary)]">
                    {[lead.address, lead.city, lead.state, lead.zip].filter(Boolean).join(", ") || "—"}
                  </span>
                </div>
              )}
            </div>
          </WidgetCard>
          {recentCalls && recentCalls.length > 0 && (
            <WidgetCard title="Recent Calls">
              <div className="flex flex-col gap-[var(--ods-sp-3)]">
                {recentCalls.slice(0, 5).map((call) => (
                  <div key={call.id} className="border-l-2 border-[var(--ods-brand-300)] pl-3 py-2">
                    <div className="flex items-center justify-between">
                      <StatusBadge status={call.status ?? "unknown"} />
                      <span className="text-[11px] text-[var(--ods-text-tertiary)]">{call.durationSeconds}s</span>
                    </div>
                    {(call.telnyxRecordingId || call.recordingUrl) && (
                      <a
                        href={call.telnyxRecordingId ? `/api/calls/${call.id}/audio` : call.recordingUrl!}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-[var(--ods-brand-600)] hover:underline mt-1 inline-block"
                      >
                        Play recording
                      </a>
                    )}
                    <p className="text-[11px] text-[var(--ods-text-tertiary)] mt-1">
                      {new Date(call.created_at).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            </WidgetCard>
          )}
        </div>
      </div>

      {showDeleteConfirm && (
        <ConfirmDialog
          open={showDeleteConfirm}
          title="Delete Lead"
          message={`Delete "${lead.first_name} ${lead.last_name}"? This cannot be undone.`}
          variant="danger"
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      {/* NOTE: `showEdit` opens nothing yet — same pre-existing gap as before this pass.
          This is a functional/data-wiring issue (no edit form + unknown useUpdateLead
          payload shape), not a styling one, so it's flagged here rather than guessed at. */}
    </PageCanvas>
  );
}