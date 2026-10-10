import React, { useState } from "react";
import { MultiValue } from "@/components/common/MultiValue";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useLead } from "@/hooks/use-leads";
import { useCallsForRecord } from "@/hooks/use-call-logs";
import { RatingBadge } from "@/components/calls/CallRating";
import { useUpdateLead, useDeleteLead } from "@/hooks/use-leads";
import { ContactCallCard } from "@/components/dialer/ContactCallCard";
import { CallScriptWidget } from "@/components/scripts/CallScriptWidget";
import { StatusBadge } from "@/components/common/StatusBadge";
import { StatusSelect } from "@/components/common/StatusSelect";
import { mapLeadProspectStatusOptions } from "@/lib/twenty/options";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { LeadForm } from "@/components/leads/LeadForm";
import { PageCanvas } from "@/components/common/PageCanvas";
import { WidgetCard } from "@/components/ui/WidgetCard";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { ArrowLeft, Edit3, Trash2, Phone, Mail, Globe, MapPin } from "@/components/ui/icons";
import { RecordPageSkeleton } from "@/components/ui/PageSkeletons";
import { CountryBadge } from "@/components/common/CountryBadge";
import { api } from "@/lib/api-client";
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
  const member = user?.memberId ? { id: user.memberId, email: user.email } : null;
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

  async function handleDelete() {
    if (!lead) return;
    try {
      await deleteLeadMutation.mutateAsync(lead.id);
      success("Lead deleted", `${lead.first_name} ${lead.last_name} has been removed`);
      navigate("/contacts");
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
      <RecordPageSkeleton />
    );
  }

  if (!lead) {
    return (
      <div className="text-center py-12">
        <p className="text-[13px] text-[var(--ods-text-secondary)]">Lead not found</p>
        <button
          onClick={() => navigate("/contacts")}
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
            onClick={() => navigate("/contacts")}
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
          <ContactCallCard
            target={{
              contactType: "lead",
              contactId: leadId ?? null,
              phone: lead.phone ?? "",
              name: `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim(),
              campaignId: lead.campaign_id ?? null,
            }}
          />
          <CallScriptWidget campaignId={lead.campaign_id ?? null} />
          <WidgetCard title="Lead Details" info={{ title: "Lead Details", what: "Everything Twenty knows about this lead." }}>
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
                {([
                  ["Company", lead.company ?? "—"],
                  ["Phone", <MultiValue kind="phone" primary={lead.phone} extras={(lead as any).additional_phones} />],
                  ["Email", <MultiValue kind="email" primary={lead.email} extras={(lead as any).additional_emails} />],
                  ["Calls", String(lead.call_count ?? 0)],
                  ["Last Called", lead.last_called_at ? new Date(lead.last_called_at).toLocaleString() : "Never"],
                  ["Created", new Date(lead.created_at).toLocaleDateString()],
                  ["Updated", new Date(lead.updated_at).toLocaleDateString()],
                ] as [string, React.ReactNode][]).map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-tertiary)]">
                      {label}
                    </dt>
                    <dd className="text-[13px] text-[var(--ods-text-primary)] mt-0.5">{value}</dd>
                  </div>
                ))}
              </dl>

              {/* Notes */}
              {lead.notes && (
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-tertiary)] mb-1">Notes</dt>
                  <p className="text-[13px] text-[var(--ods-text-secondary)] whitespace-pre-wrap leading-relaxed">{lead.notes}</p>
                </div>
              )}
            </div>
          </WidgetCard>
        </div>

        {/* Bottom Row: Notes | Contact Info | Recent Calls */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-[var(--ods-sp-6)]">
          <WidgetCard title="Notes" info={{ title: "Notes", what: "Free-text notes kept on this record." }}>
            <p className="text-[13px] text-[var(--ods-text-secondary)] whitespace-pre-wrap">
              {lead.notes ?? "No notes yet"}
            </p>
          </WidgetCard>
          <WidgetCard title="Contact Info" info={{ title: "Contact Info", what: "Phone numbers and emails. Click one to call or email it." }}>
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
          <WidgetCard title="Recent Calls" info={{ title: "Recent Calls", what: "The latest calls with this contact and how they ended." }}>
            {recentCalls && recentCalls.length > 0 ? (
              <div className="flex flex-col gap-[var(--ods-sp-3)]">
                {recentCalls.slice(0, 5).map((call) => (
                  <div key={call.id} className="border-l-2 border-[var(--ods-brand-300)] pl-3 py-2">
                    <div className="flex items-center justify-between">
                      <StatusBadge status={call.status ?? "unknown"} />
                      <span className="text-[11px] text-[var(--ods-text-tertiary)]">{call.durationSeconds}s</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <RatingBadge sentiment={call.aiSentiment} score={call.aiScore} />
                      <button
                        onClick={() => navigate(`/history/${call.id}`)}
                        className="text-[11px] text-[var(--ods-brand-600)] hover:underline"
                      >
                        View details
                      </button>
                    </div>
                    {(call.aiSummary || call.summary) && (
                      <p className="text-[12px] text-[var(--ods-text-secondary)] mt-1 line-clamp-2">
                        {call.aiSummary ?? call.summary}
                      </p>
                    )}
                    {(call.telnyxRecordingId || call.recordingUrl) && (
                      <a
                        href={`/history/${call.id}?tab=recording`}
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
            ) : (
              <p className="text-[13px] text-[var(--ods-text-tertiary)] italic">No calls yet</p>
            )}
          </WidgetCard>
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

      {showEdit && (
        <LeadForm
          initialData={lead as any}
          onClose={() => setShowEdit(false)}
          onSubmit={async (data) => {
            try {
              await updateLeadMutation.mutateAsync({
                id: lead.id,
                ...data,
              } as any);
              success("Lead updated", `${data.first_name} ${data.last_name} has been updated`);
              setShowEdit(false);
            } catch {
              toastError("Error", "Failed to update the lead");
              // Re-throw so LeadForm keeps the modal open on failure
              // instead of closing it while the update did not persist.
              throw new Error("Failed to update the lead");
            }
          }}
        />
      )}
    </PageCanvas>
  );
}