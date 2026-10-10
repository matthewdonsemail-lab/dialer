import { useEffect, useMemo, useState } from "react";
import { describeError } from "@/domains/feedback/describeError";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, ChevronRight, MoreVertical, Pencil, Phone, PhoneCall, Search, X } from "@/domains/ui/icons";
import type { CallCampaign, CallCampaignStatus } from "@/domains/api/client";
import { useCallCampaigns, useDeleteCallCampaign, useUpdateCallCampaign } from "@/domains/campaigns/data";
import { useCalls } from "@/domains/calls/data";
import { campaignCalls, campaignProgress, campaignStats, clock, type CampaignCall } from "@/domains/campaigns/stats";
import { callStatusLabel, dispositionTypeOfStatus } from "@/domains/calls/disposition";
import { formatPercent } from "@/domains/reports/data";
import { SelectMenu } from "@/domains/ui/menu";
import { Skeleton } from "@/domains/ui/skeleton";
import { ConfirmDialog } from "@/domains/ui/modal";
import { BarChart } from "@/domains/reports/parts";
import { useToast } from "@/domains/ui/toast";
import { useProspectLookup } from "@/domains/contact/list";

interface ContactLite {
  id: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
}

const STATUS_ORDER: Record<CallCampaignStatus, number> = { active: 0, completed: 1, archived: 2 };

function StatusLabel({ status }: { status: CallCampaignStatus }) {
  if (status === "completed") {
    return (
      <span className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--ods-text-secondary)]">
        <Check className="w-3.5 h-3.5" /> Completed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--ods-text-primary)]">
      <span className={`w-2 h-2 rounded-md ${status === "active" ? "bg-emerald-500" : "bg-red-500"}`} />
      {status === "active" ? "Active" : "Archived"}
    </span>
  );
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  const day = d.getDate();
  const suffix = day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th";
  return `${d.toLocaleDateString(undefined, { month: "short" })} ${day}${suffix}`;
}

function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[10px] border border-[var(--ods-border)] bg-[var(--ods-bg-secondary)] p-4 text-center">
      <div className="text-[13px] font-semibold text-[var(--ods-text-secondary)]">{label}</div>
      <div className="mt-1.5 text-2xl font-semibold tabular-nums text-[var(--ods-text-primary)]">{value}</div>
    </div>
  );
}

/**
 * WAVV-style campaign window behind the Contacts phone button: pick up where
 * you left off, see progress and statistics, manage status, start dialing.
 */
export function CampaignModal({
  open,
  onClose,
  initialCampaignId,
  contacts,
  onStartDialing,
}: {
  open: boolean;
  onClose: () => void;
  initialCampaignId?: string | null;
  /** Optional preloaded contacts; otherwise the selected campaign's contacts are looked up. */
  contacts?: ContactLite[];
  onStartDialing: (campaign: CallCampaign) => void;
}) {
  const { data: campaigns, isLoading, error } = useCallCampaigns();
  const { data: calls } = useCalls();
  const update = useUpdateCallCampaign();
  const remove = useDeleteCallCampaign();
  const { error: toastError, success } = useToast();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(initialCampaignId ?? null);
  const [view, setView] = useState<"overview" | "statistics" | "history">("overview");
  const [editingName, setEditingName] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (initialCampaignId) setSelectedId(initialCampaignId);
  }, [initialCampaignId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !confirmDelete && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, confirmDelete]);

  const sorted = useMemo(
    () =>
      [...(campaigns ?? [])]
        .filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()))
        .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.createdAt.localeCompare(a.createdAt)),
    [campaigns, query],
  );
  const selected = (campaigns ?? []).find((c) => c.id === selectedId) ?? sorted[0] ?? null;
  const allCalls = (calls ?? []) as unknown as CampaignCall[];
  // Only the selected campaign's contacts, fetched by id (never the whole contact list).
  const { data: lookedUp } = useProspectLookup(contacts ? [] : selected?.contactIds ?? []);

  const setStatus = async (campaign: CallCampaign, status: CallCampaignStatus) => {
    try {
      await update.mutateAsync({ id: campaign.id, patch: { status } });
    } catch (err) {
      toastError("Status not saved", describeError(err).detail);
    }
  };

  // A campaign completes itself once every number has been dialed (WAVV behaviour).
  const progress = selected ? campaignProgress(selected, allCalls) : null;
  useEffect(() => {
    if (selected && progress && selected.status === "active" && progress.total > 0 && progress.remaining === 0) {
      setStatus(selected, "completed");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, selected?.status, progress?.remaining]);

  if (!open) return null;

  const saveName = async () => {
    if (!selected || editingName === null) return;
    const name = editingName.trim();
    setEditingName(null);
    if (!name || name === selected.name) return;
    try {
      await update.mutateAsync({ id: selected.id, patch: { name } });
    } catch (err) {
      toastError("Name not saved", describeError(err).detail);
    }
  };

  const contactName = (id: string | null) => {
    const c = contacts ? contacts.find((x) => x.id === id) : id ? lookedUp?.get(id) : undefined;
    return c ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || c.phone || "Unknown" : "Unknown contact";
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Power dialer campaigns"
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-5xl h-[min(760px,90vh)] flex flex-col overflow-hidden rounded-[12px] border border-[var(--ods-border-strong)] bg-[var(--ods-bg-primary)] shadow-2xl"
      >
        <header className="h-14 px-5 flex items-center justify-between border-b border-[var(--ods-border)] shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-[var(--ods-brand-600)] flex items-center justify-center">
              <PhoneCall className="w-4 h-4 text-white" />
            </div>
            <span className="text-[15px] font-semibold text-[var(--ods-text-primary)]">Power Dialer</span>
            <span className="text-[13px] text-[var(--ods-text-tertiary)]">· Campaigns</span>
          </div>
          <button onClick={onClose} title="Close" className="p-1.5 rounded-md text-[var(--ods-text-secondary)] hover:bg-[var(--ods-hover)]">
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="flex flex-1 min-h-0">
          {/* campaign list */}
          <aside className="w-72 shrink-0 border-r border-[var(--ods-border)] flex flex-col min-h-0">
            <div className="p-3 border-b border-[var(--ods-border)]">
              <div className="flex items-center gap-2 h-9 px-2.5 rounded-[8px] border border-[var(--ods-border)] bg-[var(--ods-bg-secondary)] focus-within:border-[var(--ods-brand-500)]">
                <Search className="w-4 h-4 text-[var(--ods-text-tertiary)]" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search campaigns"
                  className="flex-1 bg-transparent text-[13px] text-[var(--ods-text-primary)] outline-none placeholder:text-[var(--ods-text-tertiary)]"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <div className="p-3 space-y-2">
                  {Array.from({ length: 5 }, (_, i) => (
                    <Skeleton key={i} className="h-14 rounded-[8px]" />
                  ))}
                </div>
              ) : sorted.length === 0 ? (
                <p className="p-4 text-[12px] text-[var(--ods-text-secondary)]">
                  {query ? "No campaigns match." : "No campaigns yet. Select contacts on the sheet and press the phone button to create one."}
                </p>
              ) : (
                sorted.map((c) => (
                  <button
                    key={c.id}
                    aria-current={selected?.id === c.id ? "true" : undefined}
                    onClick={() => {
                      setSelectedId(c.id);
                      setView("overview");
                      setEditingName(null);
                    }}
                    className={`w-full text-left px-4 py-3 border-b border-[var(--ods-border)] transition-colors ${
                      selected?.id === c.id ? "bg-[var(--ods-active)]" : "hover:bg-[var(--ods-hover)]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[14px] font-medium text-[var(--ods-text-primary)] truncate">{c.name}</span>
                      <StatusLabel status={c.status} />
                    </div>
                    <div className="mt-0.5 flex items-center justify-between text-[12px] text-[var(--ods-text-secondary)]">
                      <span>
                        {c.contactIds.length} number{c.contactIds.length === 1 ? "" : "s"}
                      </span>
                      <span>{shortDate(c.createdAt)}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </aside>

          {/* selected campaign */}
          <section className="flex-1 min-w-0 flex flex-col">
            {error ? (
              <div className="m-6 rounded-[10px] border border-red-500/30 bg-red-500/10 p-4 text-[13px] text-red-700">
                {(error as Error).message}
              </div>
            ) : !selected ? (
              <div className="flex-1 flex items-center justify-center p-8 text-center text-[13px] text-[var(--ods-text-secondary)]">
                Select contacts on the sheet, then press the phone button to create a campaign.
              </div>
            ) : (
              <>
                <div className="h-16 px-5 flex items-center justify-between gap-3 border-b border-[var(--ods-border)] shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    {view !== "overview" && (
                      <button onClick={() => setView("overview")} title="Back" className="p-1 rounded-md hover:bg-[var(--ods-hover)] text-[var(--ods-text-secondary)]">
                        <ArrowLeft className="w-5 h-5" />
                      </button>
                    )}
                    {editingName !== null ? (
                      <input
                        autoFocus
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={saveName}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveName();
                          if (e.key === "Escape") setEditingName(null);
                        }}
                        className="h-9 min-w-0 flex-1 px-2 rounded-md border border-[var(--ods-brand-500)] bg-[var(--ods-bg-primary)] text-xl font-semibold text-[var(--ods-text-primary)] outline-none"
                      />
                    ) : (
                      <>
                        <h2 className="text-xl font-semibold text-[var(--ods-text-primary)] truncate">{selected.name}</h2>
                        <button onClick={() => setEditingName(selected.name)} title="Rename" className="p-1 rounded-md text-[var(--ods-text-secondary)] hover:bg-[var(--ods-hover)]">
                          <Pencil className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusLabel status={selected.status} />
                    <SelectMenu
                      value={selected.status}
                      placement="bottom-end"
                      width={220}
                      onChange={(v) => (v === "delete" ? setConfirmDelete(true) : setStatus(selected, v as CallCampaignStatus))}
                      sections={[
                        {
                          title: "Set status",
                          options: [
                            { value: "active", label: "Active", dot: "bg-emerald-500" },
                            { value: "completed", label: "Completed", dot: "bg-[var(--ods-text-tertiary)]" },
                            { value: "archived", label: "Archive", dot: "bg-red-500" },
                          ],
                        },
                        { options: [{ value: "delete", label: "Delete campaign…" }] },
                      ]}
                      triggerTitle="Campaign options"
                      triggerClassName="p-1.5 rounded-md text-[var(--ods-text-secondary)] hover:bg-[var(--ods-hover)]"
                      trigger={<MoreVertical className="w-5 h-5" />}
                    />
                  </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
                  {view === "overview" ? (
                    <Overview campaign={selected} calls={allCalls} onStats={() => setView("statistics")} />
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-1 p-1 rounded-[10px] border border-[var(--ods-border)]">
                        {(["statistics", "history"] as const).map((v) => (
                          <button
                            key={v}
                            aria-pressed={view === v}
                            onClick={() => setView(v)}
                            className={`h-9 rounded-[8px] text-[13px] font-medium capitalize ${
                              view === v ? "bg-[var(--ods-active)] text-[var(--ods-text-primary)]" : "text-[var(--ods-text-secondary)] hover:bg-[var(--ods-hover)]"
                            }`}
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                      {view === "statistics" ? (
                        <Statistics campaign={selected} calls={allCalls} />
                      ) : (
                        <History campaign={selected} calls={allCalls} contactName={contactName} />
                      )}
                    </>
                  )}
                </div>

                <div className="p-4 border-t border-[var(--ods-border)] shrink-0">
                  {selected.status === "archived" ? (
                    <button
                      onClick={() => setStatus(selected, "active")}
                      className="w-full h-11 rounded-md border border-[var(--ods-border-strong)] text-[14px] font-semibold text-[var(--ods-text-primary)] hover:bg-[var(--ods-hover)]"
                    >
                      Reactivate campaign to dial
                    </button>
                  ) : (
                    <button
                      onClick={() => onStartDialing(selected)}
                      disabled={!progress || progress.remaining === 0}
                      className="w-full h-11 rounded-md bg-[var(--ods-brand-600)] text-white text-[15px] font-semibold flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50"
                    >
                      <Phone className="w-5 h-5" />
                      {progress && progress.remaining === 0 ? "All numbers dialed" : progress && progress.dialed > 0 ? "Resume Dialing" : "Start Dialing"}
                    </button>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete campaign"
        message={`Delete "${selected?.name}"? Its statistics and history will no longer be available. The contacts and their calls are not deleted.`}
        variant="danger"
        confirmLabel="Delete"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          if (!selected) return;
          const { id, name } = selected;
          setConfirmDelete(false);
          setSelectedId(null);
          try {
            await remove.mutateAsync(id);
            success("Campaign deleted", `"${name}" has been removed`);
          } catch (err) {
            toastError("Campaign not deleted", `It has been restored. ${describeError(err).detail}`);
          }
        }}
      />
    </div>
  );
}

function Overview({ campaign, calls, onStats }: { campaign: CallCampaign; calls: CampaignCall[]; onStats: () => void }) {
  const p = campaignProgress(campaign, calls);
  return (
    <>
      <div className="rounded-[10px] border border-[var(--ods-border)] bg-[var(--ods-bg-secondary)] p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[14px] font-semibold text-[var(--ods-text-primary)]">Campaign Progress</span>
          <span className="text-[13px] tabular-nums text-[var(--ods-text-secondary)]">
            {p.dialed} of {p.total} dialed · {formatPercent(p.ratio)}
          </span>
        </div>
        <div className="h-3 rounded-md bg-[var(--ods-bg-tertiary)] overflow-hidden">
          <div className="h-full rounded-md bg-emerald-500 transition-[width]" style={{ width: `${p.ratio * 100}%` }} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Tile label="Numbers Dialed" value={p.dialed} />
        <Tile label="Numbers Remaining" value={p.remaining} />
      </div>
      <button
        onClick={onStats}
        className="w-full h-14 px-5 flex items-center justify-between rounded-[10px] border border-[var(--ods-border)] bg-[var(--ods-bg-secondary)] text-[15px] font-medium text-[var(--ods-text-primary)] hover:bg-[var(--ods-hover)]"
      >
        View Campaign Statistics
        <ChevronRight className="w-5 h-5 text-[var(--ods-text-secondary)]" />
      </button>
      <p className="text-[12px] text-[var(--ods-text-secondary)]">
        Progress counts each contact called since this campaign was created. Dialing resumes at the next number not yet called.
      </p>
    </>
  );
}

function Statistics({ campaign, calls }: { campaign: CallCampaign; calls: CampaignCall[] }) {
  const s = campaignStats(campaign, calls);
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <Tile label="Calls Made" value={s.callsMade} />
        <Tile label="Connection Rate" value={s.callsMade ? formatPercent(s.connectionRate) : "—"} />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Tile label="Total Dial Time" value={clock(s.dialSeconds)} />
        <Tile label="Total Talk Time" value={clock(s.talkSeconds)} />
        <Tile label="Avg Call Length" value={clock(s.avgCallSeconds)} />
      </div>
      <div className="rounded-[10px] border border-[var(--ods-border)] bg-[var(--ods-bg-secondary)] p-4">
        <h3 className="text-center text-[14px] font-semibold text-[var(--ods-text-primary)] mb-1">Disposition Types</h3>
        <p className="text-center text-[12px] text-[var(--ods-text-secondary)] mb-3">How this campaign's calls ended. Hover a bar for the count.</p>
        {s.dispositions.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-[var(--ods-text-secondary)]">No calls in this campaign yet.</p>
        ) : (
          <>
            <BarChart
              labels={s.dispositions.map((d) => d.label)}
              series={[
                { label: "Positive", color: "#22c55e", values: s.dispositions.map((d) => (d.positive ? d.count : 0)) },
                { label: "Negative / other", color: "#ef4444", values: s.dispositions.map((d) => (d.positive ? 0 : d.count)) },
              ]}
            />
            <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[12px] text-[var(--ods-text-secondary)]">
              {s.dispositions.map((d) => (
                <span key={d.status} className="tabular-nums">
                  {d.label}: <b className="text-[var(--ods-text-primary)]">{d.count}</b>
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}

function History({ campaign, calls, contactName }: { campaign: CallCampaign; calls: CampaignCall[]; contactName: (id: string | null) => string }) {
  const navigate = useNavigate();
  const list = campaignCalls(campaign, calls).sort((a, b) => (b.startedAt || b.created_at).localeCompare(a.startedAt || a.created_at));
  if (list.length === 0) {
    return <p className="py-6 text-center text-[13px] text-[var(--ods-text-secondary)]">No calls in this campaign yet.</p>;
  }
  return (
    <div className="rounded-[10px] border border-[var(--ods-border)] divide-y divide-[var(--ods-border)]">
      {list.map((c) => {
        const type = dispositionTypeOfStatus(c.status);
        return (
          <button
            key={c.id}
            onClick={() => navigate(`/history/${c.id}`)}
            className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-[var(--ods-hover)]"
          >
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-medium text-[var(--ods-text-primary)] truncate">{contactName(c.agencyProspectId)}</div>
              <div className="text-[12px] text-[var(--ods-text-secondary)]">{c.toNumber || "—"}</div>
            </div>
            <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--ods-text-primary)]">
              <span className={`w-2 h-2 rounded-md ${type === "positive" ? "bg-emerald-500" : type === "negative" ? "bg-red-500" : "bg-gray-400"}`} />
              {callStatusLabel(c.status)}
            </span>
            <span className="w-14 text-right text-[12px] tabular-nums text-[var(--ods-text-secondary)]">{clock(c.durationSeconds)}</span>
            <span className="w-36 text-right text-[12px] text-[var(--ods-text-tertiary)]">
              {new Date(c.startedAt || c.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
            </span>
          </button>
        );
      })}
    </div>
  );
}
