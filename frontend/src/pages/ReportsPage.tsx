import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  CalendarDays,
  Clock,
  MessageSquare,
  PhoneIncoming,
  PhoneOutgoing,
  Settings,
  ThumbsUp,
  Timer,
  Users,
} from "lucide-react";
import { useCalls } from "@/hooks/use-call-logs";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { useReportSettings } from "@/hooks/use-report-settings";
import { SelectMenu } from "@/components/ui/Menu";
import { Skeleton } from "@/components/ui/Skeleton";
import { BarChart } from "@/components/reports/BarChart";
import {
  Heatmap,
  PivotTable,
  ReportCard,
  StatTiles,
  TWO_LINE_TRIGGER_CLASS,
  TwoLineTrigger,
} from "@/components/reports/ReportParts";
import { DISPOSITIONS, dispositionTypeOfStatus } from "@/lib/call-outcome";
import {
  RANGE_LABELS,
  agentOf,
  bucketsFor,
  dailySeries,
  dispositionBreakdown,
  filterCalls,
  formatMinutes,
  formatPercent,
  formatRange,
  heatmap,
  isConversation,
  isInbound,
  memberGrid,
  numberHealth,
  rangeFor,
  teamStats,
  totalsFor,
  type HealthLevel,
  type RangePreset,
  type ReportCall,
} from "@/lib/reports";

const COLORS = { outbound: "#2563eb", conversations: "#22c55e", inbound: "#60a5fa", positive: "#22c55e", negative: "#ef4444" };

type Tab = "overview" | "numbers" | "team" | "dispositions";
const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "numbers", label: "Number Health" },
  { key: "team", label: "Team Performance" },
  { key: "dispositions", label: "Disposition Report" },
];

const ENTIRE_TEAM = "__team";

/**
 * Call reporting modelled on WAVV's Reports: pick a date range and a team
 * member, then read Overview, Number Health, Team Performance or the
 * Disposition Report. Every chart sits next to the exact numbers behind it.
 * Replaces the old Dashboard.
 */
export function ReportsPage() {
  const { data: calls, isLoading } = useCalls();
  const { dailyCallGoal, conversationSeconds } = useReportSettings();
  const [tab, setTab] = usePersistedState<Tab>("reports-tab", "overview");
  const [preset, setPreset] = usePersistedState<RangePreset>("reports-range", "last7");
  const [member, setMember] = usePersistedState<string>("reports-member", ENTIRE_TEAM);

  const range = useMemo(() => rangeFor(preset), [preset]);
  const allCalls = (calls ?? []) as ReportCall[];
  const members = useMemo(() => [...new Set(allCalls.map(agentOf))].sort(), [allCalls]);
  const selectedMember = member !== ENTIRE_TEAM && members.includes(member) ? member : null;
  const scoped = useMemo(() => filterCalls(allCalls, range, selectedMember), [allCalls, range, selectedMember]);

  return (
    <div className="flex flex-col h-full min-h-0 overflow-y-auto bg-[var(--ods-bg-secondary)]">
      <div className="px-5 pt-5 pb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold text-[var(--ods-text-primary)]">Reports</h1>
          <p className="text-[12px] text-[var(--ods-text-secondary)]">
            {formatRange(range)} · {selectedMember ?? "Entire team"} · conversations are calls of {conversationSeconds}s or more
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SelectMenu
            value={preset}
            onChange={(v) => setPreset(v as RangePreset)}
            placement="bottom-end"
            sections={[{ title: "Date range", options: (Object.keys(RANGE_LABELS) as RangePreset[]).map((k) => ({ value: k, label: RANGE_LABELS[k] })) }]}
            triggerClassName={TWO_LINE_TRIGGER_CLASS}
            trigger={<TwoLineTrigger icon={CalendarDays} caption={`Date Range · ${RANGE_LABELS[preset]}`} value={formatRange(range)} />}
          />
          <SelectMenu
            value={selectedMember ?? ENTIRE_TEAM}
            onChange={setMember}
            placement="bottom-end"
            searchable={members.length > 8}
            sections={[
              { options: [{ value: ENTIRE_TEAM, label: "Entire Team" }] },
              { title: "Team members", options: members.map((m) => ({ value: m, label: m })) },
            ]}
            triggerClassName={TWO_LINE_TRIGGER_CLASS}
            trigger={<TwoLineTrigger icon={Users} caption="Team Member" value={selectedMember ?? "Entire Team"} />}
          />
        </div>
      </div>

      <div className="px-5">
        <div role="tablist" className="grid grid-cols-2 md:grid-cols-4 rounded-[10px] border border-[var(--ods-border)] bg-[var(--ods-bg-primary)] p-1 gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`h-9 rounded-[8px] text-[13px] font-medium transition-colors ${
                tab === t.key
                  ? "bg-[var(--ods-brand-600)] text-white"
                  : "text-[var(--ods-text-secondary)] hover:bg-[var(--ods-hover)] hover:text-[var(--ods-text-primary)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-5 space-y-4">
        {isLoading ? (
          <ReportsSkeleton />
        ) : tab === "overview" ? (
          <Overview calls={scoped} range={range} goal={dailyCallGoal} threshold={conversationSeconds} />
        ) : tab === "numbers" ? (
          <NumberHealthTab calls={scoped} threshold={conversationSeconds} />
        ) : tab === "team" ? (
          <TeamTab calls={scoped} threshold={conversationSeconds} />
        ) : (
          <DispositionTab calls={scoped} />
        )}
      </div>
    </div>
  );
}

function ReportsSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading reports">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-[86px] rounded-[10px]" />
        ))}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Skeleton className="h-72 rounded-[10px]" />
        <Skeleton className="h-72 rounded-[10px]" />
      </div>
      <Skeleton className="h-48 rounded-[10px]" />
    </div>
  );
}

function GoalLink({ goal }: { goal: number }) {
  return (
    <Link
      to="/settings"
      title="Change the goal in Settings → Reports"
      className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--ods-text-secondary)] hover:text-[var(--ods-text-primary)]"
    >
      <span className="w-2 h-2 rounded-full bg-emerald-500" />
      Goal: {goal}/day
      <Settings className="w-3 h-3 opacity-60" />
    </Link>
  );
}

function Overview({ calls, range, goal, threshold }: { calls: ReportCall[]; range: ReturnType<typeof rangeFor>; goal: number; threshold: number }) {
  const buckets = useMemo(() => bucketsFor(range), [range]);
  const labels = buckets.map((b) => b.label);
  const t = totalsFor(calls, threshold);
  const series = dailySeries(calls, buckets, threshold);
  const outboundGrid = memberGrid(calls, buckets, (c) => !isInbound(c));
  const convoGrid = memberGrid(calls, buckets, (c) => isConversation(c, threshold));
  const busiest = series.outboundMinutes
    .map((m, i) => ({ m: m + series.inboundMinutes[i], label: labels[i] }))
    .sort((a, b) => b.m - a.m)[0];
  const weekly = buckets.length > 0 && buckets[0].label.startsWith("Wk");

  return (
    <>
      <StatTiles
        stats={[
          { label: "Calls", value: String(t.outbound), detail: "Outbound attempts", icon: PhoneOutgoing },
          { label: "Conversations", value: String(t.conversations), detail: `Connected ≥ ${threshold}s`, icon: MessageSquare },
          {
            label: "Convo rate",
            value: t.outbound ? formatPercent(t.conversations / t.outbound) : "—",
            detail: "Conversations ÷ calls",
            icon: ThumbsUp,
          },
          { label: "Inbound", value: String(t.inbound), detail: "Calls received", icon: PhoneIncoming },
          {
            label: "Talk time",
            value: formatMinutes(t.outboundMinutes + t.inboundMinutes),
            detail: `${formatMinutes(t.outboundMinutes)} out · ${formatMinutes(t.inboundMinutes)} in`,
            icon: Clock,
          },
          {
            label: "Avg call",
            value: t.connected ? formatMinutes(t.avgConnectedSeconds / 60) : "—",
            detail: `Over ${t.connected} connected call${t.connected === 1 ? "" : "s"}`,
            icon: Timer,
          },
        ]}
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ReportCard
          title="Calls & Conversations"
          unit="Count"
          description={`How many calls were made and how many became real conversations (connected ${threshold}s or more). Hover a ${weekly ? "week" : "day"} for exact numbers.`}
        >
          <BarChart
            labels={labels}
            series={[
              { label: "Outbound", color: COLORS.outbound, values: series.outbound },
              { label: "Convos", color: COLORS.conversations, values: series.conversations },
              { label: "Inbound", color: COLORS.inbound, values: series.inbound },
            ]}
          />
          <p className="mt-2 text-[12px] text-[var(--ods-text-secondary)]">
            <b className="text-[var(--ods-text-primary)]">{t.outbound}</b> outbound ·{" "}
            <b className="text-[var(--ods-text-primary)]">{t.conversations}</b> conversations ·{" "}
            <b className="text-[var(--ods-text-primary)]">{t.inbound}</b> inbound in this range.
          </p>
        </ReportCard>

        <ReportCard
          title="Time Spent"
          unit="Minutes"
          description="Total connected call minutes, so you can see where talk time goes (inbound vs outbound) and spot trends or lulls."
        >
          <BarChart
            labels={labels}
            valueFormat={(v) => formatMinutes(v)}
            series={[
              { label: "Outbound", color: COLORS.outbound, values: series.outboundMinutes },
              { label: "Inbound", color: COLORS.inbound, values: series.inboundMinutes },
            ]}
          />
          <p className="mt-2 text-[12px] text-[var(--ods-text-secondary)]">
            <b className="text-[var(--ods-text-primary)]">{formatMinutes(t.outboundMinutes)}</b> outbound ·{" "}
            <b className="text-[var(--ods-text-primary)]">{formatMinutes(t.inboundMinutes)}</b> inbound
            {busiest && busiest.m > 0 && (
              <>
                {" "}· busiest: <b className="text-[var(--ods-text-primary)]">{busiest.label}</b> ({formatMinutes(busiest.m)})
              </>
            )}
          </p>
        </ReportCard>
      </div>

      <ReportCard
        title="Calls Made"
        unit="Outbound"
        description={`Outbound calls per team member per ${weekly ? "week" : "day"}. A ${weekly ? "week" : "day"} turns green when it reaches the goal.`}
        aside={<GoalLink goal={goal} />}
      >
        <PivotTable columns={labels} rows={outboundGrid} goal={weekly ? goal * 5 : goal} emptyText="No outbound calls in this range." />
      </ReportCard>

      <ReportCard
        title="Outbound Conversations"
        unit={`Calls lasting ${threshold}s or more`}
        description="Connected outbound calls long enough to be a real conversation, per team member."
      >
        <PivotTable columns={labels} rows={convoGrid} emptyText="No conversations in this range yet." />
      </ReportCard>
    </>
  );
}

const HEALTH_STYLE: Record<HealthLevel, { label: string; className: string }> = {
  good: { label: "Healthy", className: "bg-emerald-500/15 text-emerald-700" },
  watch: { label: "Watch", className: "bg-amber-500/15 text-amber-700" },
  risk: { label: "At risk", className: "bg-red-500/15 text-red-700" },
  "low-data": { label: "Not enough calls", className: "bg-[var(--ods-bg-tertiary)] text-[var(--ods-text-secondary)]" },
};

function NumberHealthTab({ calls, threshold }: { calls: ReportCall[]; threshold: number }) {
  const rows = numberHealth(calls, threshold);
  const atRisk = rows.filter((r) => r.health === "risk").length;
  return (
    <>
      <StatTiles
        stats={[
          { label: "Numbers used", value: String(rows.length), detail: "Caller IDs that dialed out" },
          { label: "Healthy", value: String(rows.filter((r) => r.health === "good").length), detail: "Connect rate ≥ 20%", tone: "positive" },
          { label: "Watch", value: String(rows.filter((r) => r.health === "watch").length), detail: "Connect rate 10–20%" },
          { label: "At risk", value: String(atRisk), detail: "Connect rate under 10%", tone: atRisk ? "negative" : "default" },
          { label: "Bad / wrong", value: String(rows.reduce((s, r) => s + r.badOrWrong, 0)), detail: "Calls marked bad or wrong number" },
          { label: "No answer", value: String(rows.reduce((s, r) => s + r.noAnswer, 0)), detail: "Calls nobody picked up" },
        ]}
      />
      <ReportCard
        title="Number Health"
        unit="By caller ID"
        description="How each of your numbers performs. A falling connect rate often means carriers are flagging the number as spam; rest or replace numbers marked At risk. Judged after 10 calls."
      >
        {rows.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-[var(--ods-text-secondary)]">No outbound calls in this range.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] tabular-nums">
              <thead>
                <tr className="text-left text-[12px] text-[var(--ods-text-secondary)] border-b border-[var(--ods-border)]">
                  {["Number", "Calls", "Connected", "Connect rate", "Conversations", "No answer", "Bad / wrong", "Last used", "Health"].map((h) => (
                    <th key={h} className="py-2 pr-3 font-semibold whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ods-border)]">
                {rows.map((r) => (
                  <tr key={r.number}>
                    <td className="py-2 pr-3 font-mono text-[var(--ods-text-primary)]">{r.number}</td>
                    <td className="py-2 pr-3">{r.calls}</td>
                    <td className="py-2 pr-3">{r.connected}</td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-[var(--ods-bg-tertiary)] overflow-hidden">
                          <div className="h-full bg-[var(--ods-brand-600)]" style={{ width: formatPercent(r.connectRate) }} />
                        </div>
                        {formatPercent(r.connectRate)}
                      </div>
                    </td>
                    <td className="py-2 pr-3">{r.conversations}</td>
                    <td className="py-2 pr-3">{r.noAnswer}</td>
                    <td className="py-2 pr-3">{r.badOrWrong}</td>
                    <td className="py-2 pr-3 whitespace-nowrap text-[var(--ods-text-secondary)]">
                      {r.lastUsed ? r.lastUsed.toLocaleDateString() : "—"}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`px-2 py-0.5 rounded-full text-[12px] font-medium whitespace-nowrap ${HEALTH_STYLE[r.health].className}`}>
                        {HEALTH_STYLE[r.health].label}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ReportCard>
    </>
  );
}

function TeamTab({ calls, threshold }: { calls: ReportCall[]; threshold: number }) {
  const rows = teamStats(calls, threshold);
  const maxCalls = Math.max(1, ...rows.map((r) => r.outbound));
  return (
    <>
      <ReportCard
        title="Calls by Team Member"
        unit="Count"
        description="Outbound calls and conversations per person. Hover a bar for exact numbers."
      >
        <BarChart
          labels={rows.map((r) => r.member)}
          series={[
            { label: "Outbound", color: COLORS.outbound, values: rows.map((r) => r.outbound) },
            { label: "Convos", color: COLORS.conversations, values: rows.map((r) => r.conversations) },
          ]}
        />
      </ReportCard>
      <ReportCard
        title="Team Performance"
        unit="By member"
        description="Who is dialing, how often calls turn into conversations, and how many end positively. Positive = Interested, Appointment Set, Callback, Good Number, Left Callback or Left Voicemail."
      >
        {rows.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-[var(--ods-text-secondary)]">No calls in this range.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] tabular-nums">
              <thead>
                <tr className="text-left text-[12px] text-[var(--ods-text-secondary)] border-b border-[var(--ods-border)]">
                  {["Team member", "Calls", "Conversations", "Convo rate", "Talk time", "Avg call", "Positive", "Negative", "Positive rate", "Appointments"].map((h) => (
                    <th key={h} className="py-2 pr-3 font-semibold whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ods-border)]">
                {rows.map((r) => {
                  const decided = r.positive + r.negative;
                  return (
                    <tr key={r.member}>
                      <td className="py-2 pr-3 font-medium text-[var(--ods-text-primary)] whitespace-nowrap">{r.member}</td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 rounded-full bg-[var(--ods-bg-tertiary)] overflow-hidden">
                            <div className="h-full bg-[var(--ods-brand-600)]" style={{ width: `${(r.outbound / maxCalls) * 100}%` }} />
                          </div>
                          {r.outbound}
                        </div>
                      </td>
                      <td className="py-2 pr-3">{r.conversations}</td>
                      <td className="py-2 pr-3">{r.outbound ? formatPercent(r.conversations / r.outbound) : "—"}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{formatMinutes(r.outboundMinutes + r.inboundMinutes)}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{r.connected ? formatMinutes(r.avgConnectedSeconds / 60) : "—"}</td>
                      <td className="py-2 pr-3 text-emerald-600">{r.positive}</td>
                      <td className="py-2 pr-3 text-red-600">{r.negative}</td>
                      <td className="py-2 pr-3">{decided ? formatPercent(r.positive / decided) : "—"}</td>
                      <td className="py-2 pr-3">{r.appointments}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </ReportCard>
    </>
  );
}

const ALL_CALLS = "__all";

function DispositionTab({ calls }: { calls: ReportCall[] }) {
  const [selected, setSelected] = usePersistedState<string>("reports-disposition", ALL_CALLS);
  const breakdown = dispositionBreakdown(calls);

  const matches = (c: ReportCall) => {
    if (selected === ALL_CALLS) return true;
    if (selected === "positive" || selected === "negative") return dispositionTypeOfStatus(c.status) === selected;
    return String(c.status ?? "").toUpperCase() === selected;
  };
  const focus = calls.filter(matches);
  const selectedLabel =
    selected === ALL_CALLS
      ? "All calls"
      : selected === "positive"
        ? "Positive"
        : selected === "negative"
          ? "Negative"
          : DISPOSITIONS.find((d) => d.status === selected)?.label ?? selected;
  const positive = calls.filter((c) => dispositionTypeOfStatus(c.status) === "positive").length;
  const negative = calls.filter((c) => dispositionTypeOfStatus(c.status) === "negative").length;

  const picker = (
    <SelectMenu
      value={selected}
      onChange={setSelected}
      placement="bottom-end"
      width={260}
      sections={[
        { options: [{ value: ALL_CALLS, label: "All calls" }] },
        {
          title: "Disposition type",
          options: [
            { value: "positive", label: "Positive", dot: "bg-emerald-500" },
            { value: "negative", label: "Negative", dot: "bg-red-500" },
          ],
        },
        {
          title: "Dispositions",
          options: DISPOSITIONS.map((d) => ({
            value: d.status,
            label: d.label,
            dot: d.type === "positive" ? "bg-emerald-500" : "bg-red-500",
          })),
        },
      ]}
      triggerClassName={TWO_LINE_TRIGGER_CLASS}
      trigger={<TwoLineTrigger icon={ThumbsUp} caption="Disposition" value={selectedLabel} />}
    />
  );

  return (
    <>
      <StatTiles
        stats={[
          { label: "Calls", value: String(calls.length), detail: "All calls in range" },
          { label: "Positive", value: String(positive), detail: calls.length ? `${formatPercent(positive / calls.length)} of calls` : undefined, tone: "positive" },
          { label: "Negative", value: String(negative), detail: calls.length ? `${formatPercent(negative / calls.length)} of calls` : undefined, tone: "negative" },
          { label: "Appointments", value: String(calls.filter((c) => String(c.status).toUpperCase() === "APPOINTMENT_SET").length), detail: "Appointment Set" },
          { label: "Do not contact", value: String(calls.filter((c) => String(c.status).toUpperCase() === "DNC").length), detail: "Asked not to be called" },
          { label: selectedLabel, value: String(focus.length), detail: "Matching the picker below" },
        ]}
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ReportCard title="Disposition Distribution" unit="Count" description="How calls ended. Green = positive, red = negative. Hover a bar for the count.">
          <BarChart
            labels={breakdown.map((r) => r.label)}
            series={[
              { label: "Positive", color: COLORS.positive, values: breakdown.map((r) => (r.type === "positive" ? r.count : 0)) },
              { label: "Negative / other", color: COLORS.negative, values: breakdown.map((r) => (r.type === "positive" ? 0 : r.count)) },
            ]}
          />
        </ReportCard>
        <ReportCard title="Average Call Length by Disposition" unit="Minutes" description="Longer calls usually mean more engaged prospects.">
          <BarChart
            labels={breakdown.map((r) => r.label)}
            valueFormat={(v) => formatMinutes(v)}
            series={[{ label: "Average length", color: COLORS.outbound, values: breakdown.map((r) => r.avgSeconds / 60) }]}
          />
        </ReportCard>
      </div>

      <ReportCard title="Disposition Breakdown" unit="Numbers" description="Every disposition with its count, share of calls and average length.">
        {breakdown.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-[var(--ods-text-secondary)]">No calls in this range.</p>
        ) : (
          <table className="w-full text-[13px] tabular-nums">
            <thead>
              <tr className="text-left text-[12px] text-[var(--ods-text-secondary)] border-b border-[var(--ods-border)]">
                <th className="py-2 pr-3 font-semibold">Disposition</th>
                <th className="py-2 pr-3 font-semibold">Type</th>
                <th className="py-2 pr-3 font-semibold">Calls</th>
                <th className="py-2 pr-3 font-semibold">Share</th>
                <th className="py-2 pr-3 font-semibold">Avg length</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--ods-border)]">
              {breakdown.map((r) => (
                <tr key={r.status}>
                  <td className="py-2 pr-3 text-[var(--ods-text-primary)]">
                    <span className="inline-flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${r.type === "positive" ? "bg-emerald-500" : r.type === "negative" ? "bg-red-500" : "bg-gray-400"}`} />
                      {r.label}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-[var(--ods-text-secondary)] capitalize">{r.type ?? "—"}</td>
                  <td className="py-2 pr-3">{r.count}</td>
                  <td className="py-2 pr-3">{formatPercent(r.share)}</td>
                  <td className="py-2 pr-3">{formatMinutes(r.avgSeconds / 60)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ReportCard>

      <ReportCard
        title="Disposition Heatmap"
        unit="Count"
        description={`When "${selectedLabel}" calls happen, by weekday and hour. Use it to find the best times to dial.`}
        aside={picker}
      >
        <Heatmap grid={heatmap(focus)} />
      </ReportCard>
    </>
  );
}

