import React, { useState } from "react";
import { MultiValue } from "@/components/common/MultiValue";
import { recordStatusForOutcome } from "@/lib/call-outcome";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUpdateProspect } from "@/hooks/use-prospects";
import { api } from "@/lib/api-client";
import { Softphone } from "@/components/softphone/Softphone";
import { CallScriptWidget } from "@/components/scripts/CallScriptWidget";
import { SendWebsiteWidget } from "@/components/website/SendWebsiteWidget";
import { StatusBadge } from "@/components/common/StatusBadge";
import { StatusSelect } from "@/components/common/StatusSelect";
import { mapLeadProspectStatusOptions } from "@/lib/twenty/options";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { PageCanvas } from "@/components/common/PageCanvas";
import { WidgetCard } from "@/components/ui/WidgetCard";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { ArrowLeft, Edit3, Trash2, Phone, Mail, Globe, MapPin, Star, CheckCircle, XCircle, ExternalLink } from "@/components/ui/icons";
import { CountryBadge } from "@/components/common/CountryBadge";
import { DetailPageSkeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/components/auth/AuthProvider";
import { useCallsForRecord } from "@/hooks/use-call-logs";
import { RatingBadge } from "@/components/calls/CallRating";

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
  source?: string;
  campaign_id?: string | null;
  campaign_type?: string;
  notes?: string;
  dnc?: boolean;
  sync_id?: string;
  created_at?: string;
  updated_at?: string;
  // Industry / niche (live Twenty shape, see SendWebsiteWidget_plan.md §1.1)
  slug?: string;
  niche?: string;
  label?: string;
  labelValue?: string;
  country?: string;
  rating?: number;
  reviewCount?: number;
  // Messaging + video pipeline
  outboundState?: string;
  outboundLabel?: string;
  videoStatus?: string;
  videoSource?: string;
  videoError?: string;
  videoUrl?: { primaryLinkUrl?: string; primaryLinkLabel?: string } | null;
}

export function ProspectDetailPage() {
  const { prospectId } = useParams<{ prospectId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { success, error: toastError } = useToast();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editingData, setEditingData] = useState<Partial<Prospect>>({});
  const [agencyFromNumber, setAgencyFromNumber] = useState("");
  const { user } = useAuth();
  const member = user?.memberId ? { id: user.memberId, email: user.email } : null;

  // Resolve the selected sending number to its agencyPhones row (for claiming).
  // Shared ["twentyPhones"] cache with the widget: holder state stays live.
  const { data: phones } = useQuery({
    queryKey: ["twentyPhones"],
    queryFn: async () => api.twentyPhones.list(),
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
  const activePhoneRow = (phones ?? []).find((p: any) => p.phoneNumber === agencyFromNumber) ?? null;
  const prospectCalls = useCallsForRecord({ prospectId: prospectId ?? null });

  const { data: prospect, isLoading } = useQuery<Prospect>({
    queryKey: ["prospect", prospectId],
    queryFn: () => api.prospects.get(prospectId ?? ""),
    staleTime: 0,
  });


  React.useEffect(() => {
    if (prospect) console.log("ProspectDetailPage data:", JSON.stringify(prospect, null, 2));
    if (prospect) console.log("ProspectDetailPage campaign_id:", prospect.campaign_id);
  }, [prospect]);

  // Fetch status options from Twenty CRM
  const { data: meta } = useQuery<{ fields: Record<string, Array<{ label: string; value: string; color: string }>> }>({
    queryKey: ["twenty-meta", "agencyProspects"],
    queryFn: async () => api.twentyMeta.fields("agencyProspects"),
    staleTime: Infinity,
  });

  const statusOptions = meta?.fields["coldCallStatus"]
    ? mapLeadProspectStatusOptions(meta.fields["coldCallStatus"])
    : [];

  // Edits apply to the page and the prospects table instantly; failures roll back.
  const saveProspect = useUpdateProspect();
  const setStatus = async (status: string) => {
    if (!prospect) return;
    try {
      await saveProspect.mutateAsync({ id: prospect.id, patch: { status } });
    } catch {
      toastError("Status not saved", "The change was undone. Try again.");
    }
  };
  const saveEdits = async (data: Partial<Prospect>) => {
    if (!prospectId) return;
    setShowEdit(false);
    try {
      await saveProspect.mutateAsync({ id: prospectId, patch: data });
    } catch {
      toastError("Changes not saved", "They were undone. Try again.");
    }
  };

  const deleteProspect = useMutation({
    mutationFn: () => api.prospects.delete(prospectId ?? ""),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
      navigate("/contacts");
    },
    onError: () => {
      toastError("Error", "Failed to delete prospect");
    },
  });

  async function handleCallEnd(data: { outcome: string; duration: number; notes: string; direction: "outbound" | "inbound"; recordingUrl?: string | null; callId?: string | null }) {
    // Call row is already logged to agencyCalls by the Softphone (with recording);
    // here we advance prospect status and refresh phone claim state.
    queryClient.invalidateQueries({ queryKey: ["calls"] });
    queryClient.invalidateQueries({ queryKey: ["twenty-phones"] });

    // The disposition decides what the record becomes (see lib/call-outcome).
    const newStatus = recordStatusForOutcome(data.outcome);
    if (newStatus && prospect) {
      await setStatus(newStatus);
    }
  }

  async function handleStatusChange(newStatus: string) {
    await setStatus(newStatus);
  }

  if (isLoading) {
    return (
      <DetailPageSkeleton />
    );
  }

  if (!prospect) {
    return (
      <div className="text-center py-12">
        <p className="text-[13px] text-[var(--ods-text-secondary)]">Prospect not found</p>
        <button
          onClick={() => navigate("/contacts")}
          className="mt-4 text-[13px] text-[var(--ods-brand-600)] hover:text-[var(--ods-brand-700)]"
        >
          Back to Prospects
        </button>
      </div>
    );
  }

  return (
    <PageCanvas
      title={
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/contacts")}
            aria-label="Back to prospects"
            className="p-1 -ml-1 text-[var(--ods-text-tertiary)] hover:text-[var(--ods-text-primary)] rounded-ods-sm hover:bg-[var(--ods-bg-secondary)] transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <span>
              {prospect.first_name} {prospect.last_name}
            </span>
            <StatusBadge status={prospect.status ?? "unknown"} />
            <CountryBadge country={prospect.country} />
        </div>
      }
      subtitle={prospect.company ?? "No company"}
      actions={
        <>
          <Button variant="ghost" size="sm" onClick={() => setShowEdit(true)} title="Edit" aria-label="Edit prospect">
            <Edit3 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowDeleteConfirm(true)} title="Delete" aria-label="Delete prospect">
            <Trash2 className="w-4 h-4" />
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-[var(--ods-sp-6)]">
        {/* Main Dialing Row: Softphone + Call Script + Prospect Details */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-[var(--ods-sp-6)] items-start">
          <Softphone
            lead={prospect as any}
            callerId={agencyFromNumber || undefined}
            phoneId={activePhoneRow?.id ?? null}
            member={member}
            prospectId={prospectId ?? null}
            onCallEnd={handleCallEnd}
          />
          <CallScriptWidget campaignId={prospect?.campaign_id ?? null} />
          <WidgetCard title="Prospect Details" className="h-[460px]">
            <div className="flex flex-col gap-[var(--ods-sp-4)] h-full overflow-y-auto pr-1">
              {/* Status with StatusSelect */}
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-tertiary)] mb-2">
                  Status
                </dt>
                <StatusSelect
                  value={prospect.status || "new"}
                  options={statusOptions}
                  onChange={handleStatusChange}
                />
              </div>

              {/* Qualification */}
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-tertiary)] mb-2">
                  Qualification
                </dt>
                {(prospect as any).qualificationStatus ? (
                  <Badge variant={(prospect as any).qualificationStatus === 'QUALIFIED' ? 'green' : (prospect as any).qualificationStatus === 'DISQUALIFIED' ? 'rose' : 'gray'}>
                    {(prospect as any).qualificationStatus}
                  </Badge>
                ) : (
                  <span className="text-[11px] text-[var(--ods-text-tertiary)]">—</span>
                )}
              </div>

              {/* Niche / Industry */}
              {(prospect.niche || prospect.label) && (
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-tertiary)] mb-2">
                    Industry / Niche
                  </dt>
                  <div className="flex flex-wrap gap-1">
                    {prospect.niche && <Badge variant="indigo">{prospect.niche}</Badge>}
                    {prospect.label && prospect.label !== prospect.niche && <Badge variant="purple">{prospect.label}</Badge>}
                  </div>
                </div>
              )}

              {/* Outbound State */}
              {prospect.outboundState && (
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-tertiary)] mb-2">
                    Outbound State
                  </dt>
                  <Badge variant="amber">{prospect.outboundState}</Badge>
                  {prospect.outboundLabel && (
                    <span className="ml-2 text-[11px] text-[var(--ods-text-secondary)]">{prospect.outboundLabel}</span>
                  )}
                </div>
              )}

              {/* Video Status */}
              {prospect.videoStatus && (
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-tertiary)] mb-2">
                    Video Status
                  </dt>
                  <Badge variant={prospect.videoStatus === 'READY' ? 'green' : prospect.videoStatus === 'ERROR' ? 'red' : 'gray'}>
                    {prospect.videoStatus}
                  </Badge>
                </div>
              )}

              {/* WhatsApp Status */}
              {(prospect as any).whatsappStatus && (
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-tertiary)] mb-2">
                    WhatsApp
                  </dt>
                  <Badge variant={(prospect as any).whatsappValidated ? 'green' : 'gray'}>
                    {(prospect as any).whatsappStatus}
                  </Badge>
                </div>
              )}

              <dl className="flex flex-col gap-[var(--ods-sp-3)]">
                {/* Phone with validity badge */}
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-tertiary)]">Phone</dt>
                  <dd className="text-[13px] text-[var(--ods-text-primary)] mt-0.5 flex items-center gap-1.5">
                    <MultiValue kind="phone" primary={prospect.phone} extras={(prospect as any).additional_phones} />
                    {(prospect as any).phoneValid === true && (
                      <span title="Phone validated" className="flex items-center gap-0.5 text-[11px] text-emerald-600 font-medium">
                        <CheckCircle className="w-3 h-3" /> Valid
                      </span>
                    )}
                    {(prospect as any).phoneValid === false && (
                      <span title="Phone invalid" className="flex items-center gap-0.5 text-[11px] text-red-500 font-medium">
                        <XCircle className="w-3 h-3" /> Invalid
                      </span>
                    )}
                  </dd>
                </div>

                {/* Rating & Reviews */}
                {(prospect.rating != null || prospect.reviewCount != null) && (
                  <div>
                    <dt className="text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-tertiary)]">Rating</dt>
                    <dd className="text-[13px] text-[var(--ods-text-primary)] mt-0.5 flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                      <span className="font-medium">{prospect.rating != null ? Number(prospect.rating).toFixed(1) : "—"}</span>
                      {prospect.reviewCount != null && (
                        <span className="text-[var(--ods-text-secondary)]">({prospect.reviewCount} reviews)</span>
                      )}
                    </dd>
                  </div>
                )}

                {([
                  ["Email", <MultiValue kind="email" primary={prospect.email} extras={(prospect as any).additional_emails} />],
                  ["Company", prospect.company ?? "—"],
                  ["City", prospect.city ?? "—"],
                  ["State", prospect.state ?? "—"],
                  ["Country", prospect.country ?? "—"],
                  ["Created", prospect.created_at ? new Date(prospect.created_at).toLocaleDateString() : "—"],
                ] as [string, React.ReactNode][]).map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-tertiary)]">
                      {label}
                    </dt>
                    <dd className="text-[13px] text-[var(--ods-text-primary)] mt-0.5">{value}</dd>
                  </div>
                ))}

                {/* Website */}
                {prospect.website && (
                  <div>
                    <dt className="text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-tertiary)]">Website</dt>
                    <dd className="text-[13px] mt-0.5">
                      <a href={prospect.website} target="_blank" rel="noopener noreferrer" className="text-[var(--ods-brand-600)] hover:underline flex items-center gap-1">
                        <Globe className="w-3 h-3" />{prospect.website}
                      </a>
                    </dd>
                  </div>
                )}

                {/* GHL Webhook URL */}
                {(prospect as any).ghlWebhookUrl && (
                  <div>
                    <dt className="text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-tertiary)]">GHL Webhook</dt>
                    <dd className="text-[13px] mt-0.5">
                      <a href={(prospect as any).ghlWebhookUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--ods-brand-600)] hover:underline flex items-center gap-1 truncate">
                        <ExternalLink className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{(prospect as any).ghlWebhookUrl}</span>
                      </a>
                    </dd>
                  </div>
                )}

                {/* Google Reviews URL */}
                {(prospect as any).googleReviewsUrl && (
                  <div>
                    <dt className="text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-tertiary)]">Google Reviews</dt>
                    <dd className="text-[13px] mt-0.5">
                      <a href={(prospect as any).googleReviewsUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--ods-brand-600)] hover:underline flex items-center gap-1 truncate">
                        <ExternalLink className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{(prospect as any).googleReviewsUrl}</span>
                      </a>
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          </WidgetCard>
        </div>

        {/* Send Website Row: video status + template/offer links + SMS composer */}
        <SendWebsiteWidget
          prospect={prospect}
          fromNumber={agencyFromNumber}
          onFromChange={setAgencyFromNumber}
        />

        <WidgetCard title="Recent Calls">
          {prospectCalls.length > 0 ? (
            <div className="flex flex-col gap-[var(--ods-sp-3)]">
              {prospectCalls.slice(0, 5).map((call) => (
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
                  <div className="flex items-center gap-3 mt-1">
                    {call.telnyxRecordingId && (
                      <a
                        href={`/api/calls/${call.id}/audio`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-[var(--ods-brand-600)] hover:underline"
                      >
                        Play recording
                      </a>
                    )}
                    {call.transcriptionStatus === "READY" && (
                      <span className="text-[11px] text-[var(--ods-text-tertiary)]">Transcript ready</span>
                    )}
                    {call.meetingUrl && (
                      <a
                        href={call.meetingUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-[var(--ods-brand-600)] hover:underline"
                      >
                        Meeting booked
                      </a>
                    )}
                  </div>
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

        {/* Bottom Row: Notes | Contact Info */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-[var(--ods-sp-6)]">
          <WidgetCard title="Notes">
            <p className="text-[13px] text-[var(--ods-text-secondary)] whitespace-pre-wrap">
              {prospect.notes ?? "No notes yet"}
            </p>
          </WidgetCard>
          <WidgetCard title="Contact Info">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--ods-sp-3)]">
              {prospect.phone && (
                <div className="flex items-center gap-2 text-[13px]">
                  <Phone className="w-4 h-4 text-[var(--ods-text-tertiary)]" />
                  <a href={`tel:${prospect.phone}`} className="text-[var(--ods-text-secondary)] hover:text-[var(--ods-brand-600)]" target="_blank" rel="noopener noreferrer">
                    {prospect.phone}
                  </a>
                </div>
              )}
              {prospect.email && (
                <div className="flex items-center gap-2 text-[13px]">
                  <Mail className="w-4 h-4 text-[var(--ods-text-tertiary)]" />
                  <a href={`mailto:${prospect.email}`} className="text-[var(--ods-text-secondary)] hover:text-[var(--ods-brand-600)]" target="_blank" rel="noopener noreferrer">
                    {prospect.email || "—"}
                  </a>
                </div>
              )}
              {prospect.website && (
                <div className="flex items-center gap-2 text-[13px]">
                  <Globe className="w-4 h-4 text-[var(--ods-text-tertiary)]" />
                  <a href={prospect.website} className="text-[var(--ods-text-secondary)] hover:text-[var(--ods-brand-600)]" target="_blank" rel="noopener noreferrer">
                    {prospect.website}
                  </a>
                </div>
              )}
              {(prospect.address || prospect.city || prospect.state || prospect.zip) && (
                <div className="flex items-center gap-2 text-[13px]">
                  <MapPin className="w-4 h-4 text-[var(--ods-text-tertiary)]" />
                  <span className="text-[var(--ods-text-secondary)]">
                    {[prospect.address, prospect.city, prospect.state, prospect.zip].filter(Boolean).join(", ") || "—"}
                  </span>
                </div>
              )}
            </div>
          </WidgetCard>
        </div>
      </div>

      <Modal open={showEdit} onClose={() => setShowEdit(false)} title="Edit Prospect">
        <div className="flex flex-col gap-[var(--ods-sp-4)]">
          <input
            type="text"
            placeholder="First Name"
            value={editingData.first_name ?? prospect.first_name ?? ""}
            onChange={(e) => setEditingData({ ...editingData, first_name: e.target.value })}
            className="w-full px-[var(--ods-sp-3)] py-2 border border-[var(--ods-border)] rounded-ods-sm text-[13px] bg-[var(--ods-bg-primary)] text-[var(--ods-text-primary)]"
          />
          <input
            type="text"
            placeholder="Last Name"
            value={editingData.last_name ?? prospect.last_name ?? ""}
            onChange={(e) => setEditingData({ ...editingData, last_name: e.target.value })}
            className="w-full px-[var(--ods-sp-3)] py-2 border border-[var(--ods-border)] rounded-ods-sm text-[13px] bg-[var(--ods-bg-primary)] text-[var(--ods-text-primary)]"
          />
          <input
            type="text"
            placeholder="Company"
            value={editingData.company ?? prospect.company ?? ""}
            onChange={(e) => setEditingData({ ...editingData, company: e.target.value })}
            className="w-full px-[var(--ods-sp-3)] py-2 border border-[var(--ods-border)] rounded-ods-sm text-[13px] bg-[var(--ods-bg-primary)] text-[var(--ods-text-primary)]"
          />
          <textarea
            placeholder="Notes"
            value={editingData.notes ?? prospect.notes ?? ""}
            onChange={(e) => setEditingData({ ...editingData, notes: e.target.value })}
            className="w-full px-[var(--ods-sp-3)] py-2 border border-[var(--ods-border)] rounded-ods-sm text-[13px] min-h-[100px] bg-[var(--ods-bg-primary)] text-[var(--ods-text-primary)]"
          />
        </div>
        <div className="flex gap-2 mt-6">
          <Button variant="primary" onClick={() => saveEdits(editingData)}>
            Save
          </Button>
          <Button variant="secondary" onClick={() => setShowEdit(false)}>
            Cancel
          </Button>
        </div>
      </Modal>

      {showDeleteConfirm && (
        <ConfirmDialog
          open={showDeleteConfirm}
          title="Delete Prospect"
          message={`Are you sure you want to delete "${prospect.first_name} ${prospect.last_name}"? This action cannot be undone.`}
          variant="danger"
          confirmLabel="Delete"
          onConfirm={() => deleteProspect.mutateAsync()}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </PageCanvas>
  );
}