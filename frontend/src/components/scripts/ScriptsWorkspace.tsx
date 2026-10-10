import { TabBar } from "@/components/ui/TabBar";
import { describeError } from "@/domains/feedback";
import { Chip } from "@/components/ui/Chip";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  CalendarDays,
  Copy,
  HelpCircle,
  MessageSquare,
  MoreVertical,
  Pencil,
  Phone,
  Plus,
  Save,
  Search,
  Star,
  ThumbsUp,
  Trash2,
  TrendingUp,
  Users,
  X,
  type IconComponent,
} from "@/components/ui/icons";
import { useContactFacets, useProspectLookup } from "@/lib/contacts";
import { useScripts, useCreateScript, useUpdateScript, useDeleteScript, type Script } from "@/hooks/use-scripts";
import { useCampaigns } from "@/hooks/use-campaigns";
import { useCalls } from "@/hooks/use-call-logs";
import { useReportSettings } from "@/hooks/use-report-settings";
import { SelectMenu } from "@/components/ui/Menu";
import { ScriptDetailSkeleton, ScriptListSkeleton } from "@/components/ui/PageSkeletons";
import { SectionTitle, TitlePill } from "@/components/ui/SectionTitle";
import { InfoTip } from "@/components/ui/InfoTip";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { BarChart } from "@/components/reports/BarChart";
import { EmptyState, HeadCell, ReportCard, ReportTable, StatTiles, TD, TR, TWO_LINE_TRIGGER_CLASS, TwoLineTrigger } from "@/components/reports/ReportParts";
import { DispositionBadge } from "@/components/calls/DispositionBadge";
import { durationText } from "@/components/calls/CallInsight";
import { formatMinutes, formatPercent } from "@/lib/reports";
import { timeAgo } from "@/lib/admin";
import { MIN_CALLS_FOR_VERDICT, VERDICTS, baseline, scriptStats, type Baseline, type ScriptStats } from "@/lib/script-stats";

type Tab = "performance" | "script" | "objections" | "calls";
const TABS: { key: Tab; label: string; icon: IconComponent }[] = [
  { key: "performance", label: "Performance", icon: BarChart3 },
  { key: "script", label: "Script", icon: BookOpen },
  { key: "objections", label: "Objections", icon: HelpCircle },
  { key: "calls", label: "Calls", icon: Phone },
];

const DEFAULT_CATEGORIES = ["General", "Introduction", "Objection Handling", "Follow-up", "Closing"];
const NO_CAMPAIGN = "__none";

interface Objection {
  response: string;
  category?: string;
}
interface Draft {
  name: string;
  campaignId: string | null;
  content: string;
  category: string;
  objections: { question: string; response: string }[];
}

interface ContactLite {
  id: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  campaign_id?: string | null;
}

function draftOf(s: Script): Draft {
  const objections = (s.scriptData?.objection_responses ?? {}) as Record<string, Objection>;
  return {
    name: s.name,
    campaignId: s.campaignId,
    content: s.scriptData?.content ?? "",
    category: s.scriptData?.category || "General",
    objections: Object.entries(objections).map(([question, o]) => ({ question, response: o?.response ?? "" })),
  };
}

function payloadOf(d: Draft): Partial<Script> {
  return {
    name: d.name.trim() || "Untitled script",
    campaignId: d.campaignId,
    scriptData: {
      content: d.content,
      category: d.category,
      objection_responses: Object.fromEntries(
        d.objections.filter((o) => o.question.trim()).map((o) => [o.question.trim(), { response: o.response, category: d.category }]),
      ),
    },
  };
}

function VerdictPill({ verdict }: { verdict: ScriptStats["verdict"] }) {
  const v = VERDICTS[verdict];
  return <Chip dot={v.color}>{v.label}</Chip>;
}

const VERDICT_KEY = (Object.keys(VERDICTS) as (keyof typeof VERDICTS)[]).map((k) => ({ color: VERDICTS[k].color, label: VERDICTS[k].label, note: VERDICTS[k].note }));

/**
 * Call scripts: list on the left, the selected script on the right with its
 * performance (Reports style), content, objections and calls. Used inside the
 * Contacts modal and on the Scripts page, so both behave identically.
 */
export function ScriptsWorkspace({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate();
  const { data: scripts, isLoading } = useScripts();
  const { data: campaigns } = useCampaigns();
  const { data: calls } = useCalls();
  // Only contacts that have calls (to place calls in campaigns), never the whole list.
  const { data: lookedUp } = useProspectLookup((calls ?? []).map((c) => c.agencyProspectId));
  const prospects = useMemo(() => [...(lookedUp?.values() ?? [])] as ContactLite[], [lookedUp]);
  const { data: facets } = useContactFacets();
  const { conversationSeconds } = useReportSettings();
  const create = useCreateScript();
  const update = useUpdateScript();
  const remove = useDeleteScript();
  const { success, error: toastError } = useToast();

  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("performance");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Narrow space (phone, small modal): show the list or one script, not both.
  const rootRef = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setNarrow(el.clientWidth < 760));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const all = (scripts ?? []) as Script[];
  const allCalls = calls ?? [];
  const contacts = prospects ?? [];
  const base: Baseline = useMemo(() => baseline(allCalls, conversationSeconds), [allCalls, conversationSeconds]);
  const statsById = useMemo(
    () => new Map(all.map((s) => [s.id, scriptStats(s, all, allCalls, contacts, conversationSeconds, base, facets?.campaign)])),
    [all, allCalls, contacts, conversationSeconds, base, facets],
  );
  const campaignName = (id: string | null) => (id ? (campaigns ?? []).find((c: any) => c.id === id)?.name ?? "Unknown campaign" : null);

  const shown = all
    .filter((s) => `${s.name} ${s.scriptData?.category ?? ""} ${campaignName(s.campaignId) ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => (statsById.get(b.id)?.calls.length ?? 0) - (statsById.get(a.id)?.calls.length ?? 0) || a.name.localeCompare(b.name));
  const selected = all.find((s) => s.id === selectedId) ?? shown[0] ?? null;
  const stats = selected ? statsById.get(selected.id) ?? null : null;
  const editing = draft !== null;

  // Leaving a script drops unsaved edits.
  useEffect(() => {
    setDraft(null);
  }, [selected?.id]);

  const startEdit = (to: Tab = "script") => {
    if (!selected) return;
    setDraft(draftOf(selected));
    setTab(to);
  };

  const save = async () => {
    if (!selected || !draft) return;
    try {
      await update.mutateAsync({ id: selected.id, data: payloadOf(draft) });
      setDraft(null);
      success("Script saved", `"${draft.name.trim() || "Untitled script"}" is up to date`);
    } catch (err) {
      toastError("Script not saved", `Your changes are still here. ${describeError(err).detail}`);
    }
  };

  const createNew = async (from?: Script) => {
    try {
      const data: Partial<Script> = from
        ? { ...payloadOf(draftOf(from)), name: `Copy of ${from.name}` }
        : { name: "New script", campaignId: null, scriptData: { content: "", category: "General", objection_responses: {} } };
      const created: any = await create.mutateAsync(data);
      if (created?.id) {
        setSelectedId(created.id);
        setShowDetail(true);
        setDraft(draftOf(created as Script));
        setTab("script");
      }
      success(from ? "Script duplicated" : "Script created", from ? "Edit the copy, then save." : "Write the script, link a campaign, then save.");
    } catch (err) {
      toastError("Script not created", describeError(err).detail);
    }
  };

  const categories = [...new Set([...DEFAULT_CATEGORIES, ...all.map((s) => s.scriptData?.category).filter(Boolean)])] as string[];

  return (
    <div ref={rootRef} className="flex flex-1 min-h-0">
      {/* script list */}
      <aside
        className={`${narrow ? (showDetail ? "hidden" : "flex-1") : "w-80 shrink-0 border-r border-[var(--ods-border)]"} flex flex-col min-h-0`}
      >
        <div className="p-3 border-b border-[var(--ods-border)] flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 h-9 px-2.5 rounded-[8px] border border-[var(--ods-border)] bg-[var(--ods-bg-secondary)] focus-within:border-[var(--ods-brand-500)]">
            <Search className="w-4 h-4 text-[var(--ods-text-tertiary)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search scripts"
              className="flex-1 min-w-0 bg-transparent text-[14px] text-[var(--ods-text-primary)] outline-none placeholder:text-[var(--ods-text-tertiary)]"
            />
          </div>
          <button
            onClick={() => createNew()}
            disabled={create.isPending}
            title="New script"
            className="h-9 px-3 inline-flex items-center gap-1.5 rounded-[8px] bg-[var(--ods-brand-600)] text-white text-[13px] font-semibold hover:opacity-90 disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            New
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <ScriptListSkeleton />
          ) : shown.length === 0 ? (
            <EmptyState>{query ? "No scripts match." : "No scripts yet. Press New to write one."}</EmptyState>
          ) : (
            shown.map((s) => {
              const st = statsById.get(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => {
                    setSelectedId(s.id);
                    setShowDetail(true);
                    setTab("performance");
                  }}
                  className={`w-full text-left px-4 py-3 border-b border-[var(--ods-border)] transition-colors ${
                    selected?.id === s.id ? "bg-[var(--ods-active)]" : "hover:bg-[var(--ods-hover)]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[15px] font-semibold text-[var(--ods-text-primary)] truncate">{s.name}</span>
                    {st && <VerdictPill verdict={st.verdict} />}
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[12px] text-[var(--ods-text-secondary)]">
                    <span className="truncate">{campaignName(s.campaignId) ?? "No campaign"}</span>
                    <span className="shrink-0 tabular-nums font-semibold">
                      {st?.calls.length ?? 0} calls{st?.positiveRate != null ? ` · ${formatPercent(st.positiveRate)} positive` : ""}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* selected script */}
      <section className={`${narrow && !showDetail ? "hidden" : "flex"} flex-1 min-w-0 flex-col bg-[var(--ods-bg-secondary)]`}>
        {isLoading ? (
          <ScriptDetailSkeleton />
        ) : !selected || !stats ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <EmptyState>Pick a script on the left, or press New.</EmptyState>
          </div>
        ) : (
          <>
            <div className="px-5 pt-4 pb-3 flex items-center justify-between gap-3 bg-[var(--ods-bg-primary)] border-b border-[var(--ods-border)]">
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                {narrow && (
                  <button
                    onClick={() => setShowDetail(false)}
                    aria-label="Back to scripts"
                    title="Back to scripts"
                    className="w-9 h-9 shrink-0 inline-flex items-center justify-center rounded-[8px] border border-[var(--ods-border-strong)] text-[var(--ods-text-secondary)]"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                )}
                {editing ? (
                  <input
                    value={draft!.name}
                    onChange={(e) => setDraft({ ...draft!, name: e.target.value })}
                    aria-label="Script name"
                    className="h-10 min-w-0 w-[320px] px-3 rounded-[8px] border border-[var(--ods-brand-500)] bg-[var(--ods-bg-primary)] text-xl font-semibold text-[var(--ods-text-primary)] outline-none"
                  />
                ) : (
                  <SectionTitle
                    as="h2"
                    title={selected.name}
                    pill={selected.scriptData?.category || "General"}
                    info={{
                      title: selected.name,
                      icon: BookOpen,
                      what: "A call script shows beside the dialer whenever an agent calls a contact in its campaign.",
                      formula: ["Contact's campaign", "=", "Script's campaign", "→", "Script on screen"],
                    }}
                  />
                )}
                <VerdictPill verdict={stats.verdict} />
              </div>
              <SelectMenu
                value={null}
                placement="bottom-end"
                width={220}
                onChange={(v) => (v === "edit" ? startEdit() : v === "duplicate" ? createNew(selected) : setConfirmDelete(true))}
                sections={[
                  {
                    options: [
                      { value: "edit", label: "Edit script", icon: <Pencil className="ods-menu-icon" /> },
                      { value: "duplicate", label: "Duplicate", icon: <Copy className="ods-menu-icon" /> },
                    ],
                  },
                  { options: [{ value: "delete", label: "Delete script…", icon: <Trash2 className="ods-menu-icon !text-red-600" /> }] },
                ]}
                triggerTitle="Script options"
                triggerClassName="w-9 h-9 inline-flex items-center justify-center rounded-[8px] border border-[var(--ods-border-strong)] text-[var(--ods-text-secondary)]"
                trigger={<MoreVertical className="w-4 h-4" />}
              />
            </div>

            <div className="px-5 pt-4">
              <TabBar
                tabs={TABS.map((t) =>
                  t.key === "objections"
                    ? { ...t, badge: editing ? draft!.objections.length : Object.keys(selected.scriptData?.objection_responses ?? {}).length }
                    : t.key === "calls"
                      ? { ...t, badge: stats.calls.length }
                      : t,
                )}
                value={tab}
                onChange={setTab}
              />
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
              {tab === "performance" && <Performance stats={stats} base={base} campaign={campaignName(selected.campaignId)} />}
              {tab === "script" && (
                <ScriptBody
                  script={selected}
                  draft={draft}
                  setDraft={setDraft}
                  categories={categories}
                  campaigns={(campaigns ?? []) as any[]}
                  campaignName={campaignName(selected.campaignId)}
                />
              )}
              {tab === "objections" && <Objections script={selected} draft={draft} setDraft={setDraft} onEdit={() => startEdit("objections")} />}
              {tab === "calls" && (
                <Calls
                  stats={stats}
                  contacts={contacts}
                  onOpen={(id) => {
                    onNavigate?.();
                    navigate(`/history/${id}`);
                  }}
                />
              )}
            </div>

            <div className="p-4 border-t border-[var(--ods-border)] bg-[var(--ods-bg-primary)] shrink-0">
              {editing ? (
                <div className="flex gap-3">
                  <button
                    onClick={() => setDraft(null)}
                    className="flex-1 h-11 rounded-md border border-[var(--ods-border-strong)] text-[15px] font-semibold text-[var(--ods-text-primary)] hover:bg-[var(--ods-hover)] inline-flex items-center justify-center gap-2"
                  >
                    <X className="w-4 h-4" />
                    Cancel
                  </button>
                  <button
                    onClick={save}
                    disabled={update.isPending}
                    className="flex-[2] h-11 rounded-md bg-[var(--ods-brand-600)] text-white text-[15px] font-semibold inline-flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    {update.isPending ? "Saving…" : "Save changes"}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => startEdit()}
                  className="w-full h-11 rounded-md bg-[var(--ods-brand-600)] text-white text-[15px] font-semibold inline-flex items-center justify-center gap-2 hover:opacity-90"
                >
                  <Pencil className="w-4 h-4" />
                  Edit script
                </button>
              )}
            </div>
          </>
        )}
      </section>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete script"
        message={`Delete "${selected?.name}"? Agents will no longer see it during calls. Calls already made are not affected.`}
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
            success("Script deleted", `"${name}" has been removed`);
          } catch (err) {
            toastError("Script not deleted", describeError(err).detail);
          }
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------ Performance */

function Performance({ stats, base, campaign }: { stats: ScriptStats; base: Baseline; campaign: string | null }) {
  if (!campaign) {
    return (
      <ReportCard title="Not in use" unit="No campaign" tip={{ title: "Not in use", icon: BookOpen, what: "Agents only see a script when it is linked to a campaign." }}>
        <EmptyState>Link this script to a campaign (Edit script → Campaign) so agents see it during calls and its results show here.</EmptyState>
      </ReportCard>
    );
  }
  const compare: { label: string; mine: number | null; team: number | null; fmt: (v: number) => string }[] = [
    { label: "Positive rate", mine: stats.positiveRate, team: base.positiveRate, fmt: formatPercent },
    { label: "Conversation rate", mine: stats.convoRate, team: base.convoRate, fmt: formatPercent },
    { label: "Average AI score", mine: stats.avgScore, team: base.avgScore, fmt: (v) => String(Math.round(v)) },
  ];
  return (
    <>
      <StatTiles
        stats={[
          { label: "Calls", value: String(stats.calls.length), icon: Phone, tip: { title: "Calls", what: `Calls to contacts in "${campaign}", where this script shows.` } },
          {
            label: "Conversations",
            value: String(stats.conversations),
            icon: MessageSquare,
            tone: "positive",
            tip: { title: "Conversations", what: "Calls long enough to be a real conversation.", formula: ["Calls", "≥", "conversation length"] },
          },
          {
            label: "Positive rate",
            value: stats.positiveRate == null ? "—" : formatPercent(stats.positiveRate),
            icon: ThumbsUp,
            tone: stats.verdict === "strong" ? "positive" : stats.verdict === "weak" ? "negative" : "default",
            tip: {
              title: "Positive rate",
              what: "Of the calls with an outcome, how many ended well. This decides the verdict.",
              formula: ["Positive", "÷", "Positive + Negative", "=", "Rate"],
              key: VERDICT_KEY,
            },
          },
          { label: "Appointments", value: String(stats.appointments), icon: CalendarDays, tone: stats.appointments ? "positive" : "default", tip: { title: "Appointments", what: "Calls that ended Appointment Set." } },
          {
            label: "AI score",
            value: stats.avgScore == null ? "—" : String(Math.round(stats.avgScore)),
            icon: Star,
            tip: { title: "Average AI score", what: "The average 0-100 call rating across this script's analyzed calls." },
          },
          { label: "Agents", value: String(stats.agents.length), icon: Users, tip: { title: "Agents", what: stats.agents.length ? stats.agents.join(", ") : "Nobody has called this campaign yet." } },
        ]}
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ReportCard
          title="Verdict"
          unit="vs team average"
          tip={{
            title: "Verdict",
            icon: TrendingUp,
            what: `Compares this script's positive rate with every call your team made. Judged after ${MIN_CALLS_FOR_VERDICT} calls.`,
            key: VERDICT_KEY,
            use: "Rewrite weak scripts; copy what works from strong ones.",
          }}
          aside={<VerdictPill verdict={stats.verdict} />}
        >
          <ReportTable>
            <thead>
              <tr>
                <HeadCell>Measure</HeadCell>
                <HeadCell>This script</HeadCell>
                <HeadCell>Team</HeadCell>
                <HeadCell tip={{ title: "Difference", what: "This script minus the team average. Green is better, red is worse." }}>Difference</HeadCell>
              </tr>
            </thead>
            <tbody>
              {compare.map((r) => {
                const diff = r.mine != null && r.team != null ? r.mine - r.team : null;
                const pct = r.label !== "Average AI score";
                return (
                  <tr key={r.label} className={TR}>
                    <td className={`${TD} font-semibold`}>{r.label}</td>
                    <td className={`${TD} font-bold`}>{r.mine == null ? "—" : r.fmt(r.mine)}</td>
                    <td className={TD}>{r.team == null ? "—" : r.fmt(r.team)}</td>
                    <td className={`${TD} font-bold ${diff == null || Math.abs(diff) < 1e-9 ? "" : diff > 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {diff == null ? "—" : `${diff > 0 ? "+" : ""}${pct ? `${Math.round(diff * 100)} pts` : Math.round(diff)}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </ReportTable>
        </ReportCard>

        <ReportCard
          title="Used On"
          unit="Campaign"
          tip={{ title: "Used On", icon: BookOpen, what: "Where agents see this script, and who has used it." }}
        >
          <ReportTable>
            <tbody>
              {(
                [
                  ["Campaign", campaign],
                  ["Contacts in campaign", stats.contacts.toLocaleString()],
                  ["Talk time", formatMinutes(stats.talkSeconds / 60)],
                  ["Agents", stats.agents.join(", ") || "—"],
                  [
                    "Shared with",
                    stats.sharedWith ? (
                      <span className="inline-flex items-center gap-1">
                        {stats.sharedWith} other script{stats.sharedWith === 1 ? "" : "s"}
                        <InfoTip
                          className="w-5 h-5"
                          tip={{ title: "Shared campaign", what: "Scripts on the same campaign show for the same calls, so they share these numbers.", use: "Give each script its own campaign to compare them." }}
                        />
                      </span>
                    ) : (
                      "Only this script"
                    ),
                  ],
                ] as [string, React.ReactNode][]
              ).map(([k, v]) => (
                <tr key={k} className={TR}>
                  <HeadCell className="w-[190px]">{k}</HeadCell>
                  <td className={`${TD} whitespace-normal font-semibold`}>{v}</td>
                </tr>
              ))}
            </tbody>
          </ReportTable>
        </ReportCard>
      </div>

      <ReportCard
        title="How Calls Ended"
        unit="Count"
        tip={{
          title: "How Calls Ended",
          icon: BarChart3,
          what: "Dispositions of this script's calls.",
          key: [
            { color: "#22c55e", label: "Positive" },
            { color: "#ef4444", label: "Negative / other" },
          ],
        }}
      >
        {stats.dispositions.length === 0 ? (
          <EmptyState>No calls to this campaign yet.</EmptyState>
        ) : (
          <BarChart
            labels={stats.dispositions.map((d) => d.label)}
            series={[
              { label: "Positive", color: "#22c55e", values: stats.dispositions.map((d) => (d.positive ? d.count : 0)) },
              { label: "Negative / other", color: "#ef4444", values: stats.dispositions.map((d) => (d.positive ? 0 : d.count)) },
            ]}
          />
        )}
      </ReportCard>
    </>
  );
}

/* ----------------------------------------------------------------- Script */

const INPUT =
  "w-full rounded-[8px] border border-[var(--ods-border-strong)] bg-[var(--ods-bg-primary)] px-3 text-[14px] text-[var(--ods-text-primary)] outline-none focus:border-[var(--ods-brand-500)] placeholder:text-[var(--ods-text-tertiary)]";

function ScriptBody({
  script,
  draft,
  setDraft,
  categories,
  campaigns,
  campaignName,
}: {
  script: Script;
  draft: Draft | null;
  setDraft: (d: Draft) => void;
  categories: string[];
  campaigns: { id: string; name: string }[];
  campaignName: string | null;
}) {
  if (!draft) {
    const content = script.scriptData?.content ?? "";
    return (
      <>
        <ReportCard
          title="Details"
          unit={campaignName ? "Live" : "Not in use"}
          tip={{ title: "Details", icon: BookOpen, what: "Where this script shows and how it is grouped." }}
        >
          <ReportTable>
            <tbody>
              {(
                [
                  ["Campaign", campaignName ?? "No campaign: agents will not see this script"],
                  ["Category", script.scriptData?.category || "General"],
                  ["Last edited", `${new Date(script.updated_at).toLocaleString()} (${timeAgo(script.updated_at)})`],
                ] as [string, string][]
              ).map(([k, v]) => (
                <tr key={k} className={TR}>
                  <HeadCell className="w-[160px]">{k}</HeadCell>
                  <td className={`${TD} whitespace-normal font-semibold`}>{v}</td>
                </tr>
              ))}
            </tbody>
          </ReportTable>
        </ReportCard>
        <ReportCard
          title="What to Say"
          unit={`${content.trim() ? content.trim().split(/\s+/).length : 0} words`}
          tip={{ title: "What to Say", icon: MessageSquare, what: "The script the agent reads during the call." }}
        >
          {content.trim() ? (
            <p className="text-[15px] leading-relaxed text-[var(--ods-text-primary)] whitespace-pre-wrap">{content}</p>
          ) : (
            <EmptyState>This script is empty. Press Edit script to write it.</EmptyState>
          )}
        </ReportCard>
      </>
    );
  }

  return (
    <>
      <ReportCard title="Details" unit="Editing" tip={{ title: "Details", icon: BookOpen, what: "Link a campaign so agents see this script when they call its contacts." }}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <SelectMenu
            value={draft.campaignId ?? NO_CAMPAIGN}
            onChange={(v) => setDraft({ ...draft, campaignId: v === NO_CAMPAIGN ? null : v })}
            searchable={campaigns.length > 8}
            sections={[
              { options: [{ value: NO_CAMPAIGN, label: "No campaign" }] },
              { title: "Campaigns", options: campaigns.map((c) => ({ value: c.id, label: c.name })) },
            ]}
            triggerClassName={`${TWO_LINE_TRIGGER_CLASS} w-full`}
            trigger={<TwoLineTrigger icon={Phone} caption="Campaign" value={campaigns.find((c) => c.id === draft.campaignId)?.name ?? "No campaign"} />}
          />
          <SelectMenu
            value={draft.category}
            onChange={(v) => setDraft({ ...draft, category: v })}
            sections={[{ title: "Category", options: categories.map((c) => ({ value: c, label: c })) }]}
            triggerClassName={`${TWO_LINE_TRIGGER_CLASS} w-full`}
            trigger={<TwoLineTrigger icon={BookOpen} caption="Category" value={draft.category} />}
          />
        </div>
      </ReportCard>
      <ReportCard title="What to Say" unit="Editing" tip={{ title: "What to Say", icon: MessageSquare, what: "Write it the way the agent should say it. Short paragraphs read best on a call." }}>
        <textarea
          value={draft.content}
          onChange={(e) => setDraft({ ...draft, content: e.target.value })}
          rows={14}
          placeholder="Hi, this is … from …. I'm calling because …"
          className={`${INPUT} py-3 leading-relaxed resize-y`}
        />
      </ReportCard>
    </>
  );
}

/* ------------------------------------------------------------- Objections */

function Objections({ script, draft, setDraft, onEdit }: { script: Script; draft: Draft | null; setDraft: (d: Draft) => void; onEdit: () => void }) {
  const [q, setQ] = useState("");
  const [r, setR] = useState("");

  if (!draft) {
    const list = Object.entries((script.scriptData?.objection_responses ?? {}) as Record<string, Objection>);
    return (
      <ReportCard
        title="Objections"
        unit={`${list.length}`}
        tip={{ title: "Objections", icon: HelpCircle, what: "What prospects push back with, and what the agent says back. Agents open these from the script panel during a call." }}
        aside={
          <button onClick={onEdit} className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-[var(--ods-border-strong)] text-[13px] font-semibold text-[var(--ods-brand-600)] hover:bg-[var(--ods-hover)]">
            <Plus className="w-3.5 h-3.5" />
            Add objection
          </button>
        }
      >
        {list.length === 0 ? (
          <EmptyState>No objections yet.</EmptyState>
        ) : (
          <div className="space-y-3">
            {list.map(([question, o], i) => (
              <div key={question} className="rounded-[10px] border border-[var(--ods-border)] p-4">
                <div className="flex items-start gap-2.5">
                  <span className="w-6 h-6 shrink-0 rounded-md bg-amber-500/15 text-amber-700 text-[12px] font-bold flex items-center justify-center">{i + 1}</span>
                  <p className="text-[15px] font-semibold text-[var(--ods-text-primary)]">“{question}”</p>
                </div>
                <p className="mt-2 pl-[34px] text-[14px] leading-relaxed text-[var(--ods-text-secondary)] whitespace-pre-wrap">{o?.response || "No response written yet."}</p>
              </div>
            ))}
          </div>
        )}
      </ReportCard>
    );
  }

  const set = (i: number, patch: Partial<Draft["objections"][number]>) =>
    setDraft({ ...draft, objections: draft.objections.map((o, j) => (j === i ? { ...o, ...patch } : o)) });

  return (
    <>
      <ReportCard title="Objections" unit="Editing" tip={{ title: "Objections", icon: HelpCircle, what: "Edit the objection and the answer the agent gives." }}>
        {draft.objections.length === 0 ? (
          <EmptyState>No objections yet. Add one below.</EmptyState>
        ) : (
          <div className="space-y-3">
            {draft.objections.map((o, i) => (
              <div key={i} className="rounded-[10px] border border-[var(--ods-border)] p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <input value={o.question} onChange={(e) => set(i, { question: e.target.value })} placeholder="What the prospect says" className={`${INPUT} h-10 font-semibold`} />
                  <button
                    onClick={() => setDraft({ ...draft, objections: draft.objections.filter((_, j) => j !== i) })}
                    title="Remove objection"
                    className="w-10 h-10 shrink-0 inline-flex items-center justify-center rounded-[8px] border border-[var(--ods-border-strong)] text-red-600 hover:bg-red-500/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <textarea value={o.response} onChange={(e) => set(i, { response: e.target.value })} rows={3} placeholder="What the agent says back" className={`${INPUT} py-2 resize-y`} />
              </div>
            ))}
          </div>
        )}
      </ReportCard>
      <ReportCard title="Add Objection" unit="New" tip={{ title: "Add Objection", icon: Plus, what: "Add a common push-back and the best answer to it." }}>
        <div className="space-y-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder='e.g. "We already have someone for that"' className={`${INPUT} h-10`} />
          <textarea value={r} onChange={(e) => setR(e.target.value)} rows={3} placeholder="What the agent says back" className={`${INPUT} py-2 resize-y`} />
          <button
            onClick={() => {
              if (!q.trim()) return;
              setDraft({ ...draft, objections: [...draft.objections, { question: q.trim(), response: r }] });
              setQ("");
              setR("");
            }}
            disabled={!q.trim()}
            className="h-9 px-4 inline-flex items-center gap-1.5 rounded-[8px] bg-[var(--ods-brand-600)] text-white text-[13px] font-semibold hover:opacity-90 disabled:opacity-40"
          >
            <Plus className="w-3.5 h-3.5" />
            Add to script
          </button>
        </div>
      </ReportCard>
    </>
  );
}

/* ------------------------------------------------------------------ Calls */

function Calls({ stats, contacts, onOpen }: { stats: ScriptStats; contacts: ContactLite[]; onOpen: (id: string) => void }) {
  const names = useMemo(() => new Map(contacts.map((c) => [c.id, `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || c.company || ""])), [contacts]);
  const list = [...stats.calls].sort((a, b) => new Date(b.startedAt ?? b.created_at).getTime() - new Date(a.startedAt ?? a.created_at).getTime());
  return (
    <ReportCard
      title="Calls"
      unit={`${list.length}`}
      tip={{ title: "Calls", icon: Phone, what: "Every call made with this script on screen, newest first.", use: "Click a row to open the full call review." }}
    >
      {list.length === 0 ? (
        <EmptyState>No calls with this script yet.</EmptyState>
      ) : (
        <ReportTable>
          <thead>
            <tr>
              <HeadCell>When</HeadCell>
              <HeadCell>Contact</HeadCell>
              <HeadCell>Agent</HeadCell>
              <HeadCell>Disposition</HeadCell>
              <HeadCell>Duration</HeadCell>
              <HeadCell>AI score</HeadCell>
            </tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id} onClick={() => onOpen(c.id)} className={`${TR} cursor-pointer`}>
                <td className={`${TD} text-[var(--ods-text-secondary)]`} title={new Date(c.startedAt ?? c.created_at).toLocaleString()}>
                  {timeAgo(c.startedAt ?? c.created_at)}
                </td>
                <td className={`${TD} font-semibold`}>{names.get(c.agencyProspectId ?? "") || c.toNumber || "—"}</td>
                <td className={TD}>{c.createdBy?.name || "Unknown"}</td>
                <td className={TD}>
                  <DispositionBadge status={c.status} />
                </td>
                <td className={TD}>{durationText(c.durationSeconds ?? 0)}</td>
                <td className={`${TD} font-semibold`}>{c.aiScore ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </ReportTable>
      )}
    </ReportCard>
  );
}

/** Same window as the Contacts campaign modal, with the scripts workspace inside. */
export function ScriptsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Call scripts"
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-6xl h-[min(820px,92vh)] flex flex-col overflow-hidden rounded-[12px] border border-[var(--ods-border-strong)] bg-[var(--ods-bg-primary)] shadow-2xl"
      >
        <ScriptsHeader onClose={onClose} />
        <ScriptsWorkspace onNavigate={onClose} />
      </div>
    </div>
  );
}

export function ScriptsHeader({ onClose }: { onClose?: () => void }) {
  return (
    <header className="h-14 px-5 flex items-center justify-between border-b border-[var(--ods-border)] shrink-0">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-[8px] bg-[var(--ods-brand-600)] flex items-center justify-center">
          <BookOpen className="w-4 h-4 text-white" />
        </div>
        <SectionTitle
          as="h1"
          title="Call Scripts"
          info={{
            title: "Call Scripts",
            icon: BookOpen,
            what: "What agents say on calls, the answers to objections, and how well each script performs.",
            formula: ["Script", "+", "Campaign", "→", "Shown during calls"],
            key: VERDICT_KEY,
          }}
        />
        <TitlePill>Performance from your calls</TitlePill>
      </div>
      {onClose && (
        <button onClick={onClose} title="Close" className="w-9 h-9 inline-flex items-center justify-center rounded-[8px] text-[var(--ods-text-secondary)] hover:bg-[var(--ods-hover)]">
          <X className="w-5 h-5" />
        </button>
      )}
    </header>
  );
}
