import { ReportsBodySkeleton } from "@/components/ui/PageSkeletons";
import { TabBar } from "@/components/ui/TabBar";
import { Chip } from "@/components/ui/Chip";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Ban,
  BarChart3 as BarChartIcon,
  CalendarDays,
  CheckCircle,
  Clock,
  MessageSquare,
  Phone,
  PhoneIncoming,
  PhoneOff,
  PhoneOutgoing,
  Settings,
  Star,
  ThumbsUp,
  Timer,
  TrendingUp,
  Users,
  XCircle,
  type IconComponent,
} from "@/components/ui/icons";
import { useCalls } from "@/hooks/use-call-logs";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { useReportSettings } from "@/hooks/use-report-settings";
import { SelectMenu } from "@/components/ui/Menu";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { BarChart } from "@/components/reports/BarChart";
import {
  ChartSummary,
  EmptyState,
  HeadCell,
  Heatmap,
  PivotTable,
  ReportCard,
  ReportTable,
  StatTiles,
  TD,
  TR,
  TWO_LINE_TRIGGER_CLASS,
  TwoLineTrigger,
} from "@/components/reports/ReportParts";
import { DISPOSITIONS, dispositionTypeOfStatus } from "@/lib/call-outcome";
import { DispositionBadge, DispositionIcon } from "@/components/calls/DispositionBadge";
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
const TABS: { key: Tab; label: string; icon: IconComponent }[] = [
  { key: "overview", label: "Overview", icon: BarChartIcon },
  { key: "numbers", label: "Number Health", icon: Phone },
  { key: "team", label: "Team Performance", icon: Users },
  { key: "dispositions", label: "Disposition Report", icon: ThumbsUp },
];

const ENTIRE_TEAM = "__team";

/**
 * Call reporting modelled on WAVV's Reports: pick a date range and a team
 * member, then read Overview, Number Health, Team Performance or the
 * Disposition Report. Every chart sits next to the exact numbers behind it,
 * and every explanation lives behind an eye tooltip.
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
        <SectionTitle
          as="h1"
          title="Reports"
          pill={selectedMember ?? "Entire team"}
          info={{
            title: "Reports",
            icon: BarChartIcon,
            what: `Everything dialed in ${formatRange(range)} for ${selectedMember ?? "the entire team"}.`,
            formula: ["Connected call", "≥", `${conversationSeconds}s`, "=", "Conversation"],
            use: "Change the date range or team member on the right; every tab updates.",
          }}
        />
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
        <TabBar tabs={TABS} value={tab} onChange={setTab} />
      </div>

      <div className="p-5 space-y-4">
        {isLoading ? (
          <ReportsBodySkeleton tab={tab} />
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

function GoalLink({ goal }: { goal: number }) {
  return (
    <Link
      to="/settings"
      title="Change the goal in Settings → Reports"
      className="inline-flex items-center gap-2 h-8 px-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-[13px] font-semibold text-emerald-700 hover:bg-emerald-500/20"
    >
      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
      Goal {goal}/day
      <Settings className="w-3.5 h-3.5 opacity-70" />
    </Link>
  );
}

const SERIES_KEY = {
  outbound: { color: COLORS.outbound, label: "Outbound", note: "calls you made" },
  convos: { color: COLORS.conversations, label: "Convos", note: "real conversations" },
  inbound: { color: COLORS.inbound, label: "Inbound", note: "calls received" },
};

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
  const period = weekly ? "week" : "day";
  const target = weekly ? goal * 5 : goal;

  return (
    <>
      <StatTiles
        stats={[
          {
            label: "Calls",
            value: String(t.outbound),
            icon: PhoneOutgoing,
            tip: { title: "Calls", what: "Every outbound dial attempt, answered or not.", formula: ["Outbound dials", "=", "Calls"], use: "Check activity against the daily goal." },
          },
          {
            label: "Conversations",
            value: String(t.conversations),
            icon: MessageSquare,
            tone: "positive",
            tip: {
              title: "Conversations",
              what: "Calls long enough to count as a real conversation.",
              formula: ["Connected call", "≥", `${threshold}s`, "=", "Conversation"],
              use: "Measure real contact, not just dials.",
            },
          },
          {
            label: "Convo rate",
            value: t.outbound ? formatPercent(t.conversations / t.outbound) : "—",
            icon: ThumbsUp,
            tip: {
              title: "Convo rate",
              what: "The share of dials that turned into a conversation.",
              formula: ["Conversations", "÷", "Calls", "=", "Convo rate"],
              use: "Spot bad lists or numbers when it drops.",
            },
          },
          {
            label: "Inbound",
            value: String(t.inbound),
            icon: PhoneIncoming,
            tip: { title: "Inbound", what: "Calls prospects made to you.", formula: ["Calls received", "=", "Inbound"], use: "See how many people call back." },
          },
          {
            label: "Talk time",
            value: formatMinutes(t.outboundMinutes + t.inboundMinutes),
            icon: Clock,
            tip: {
              title: "Talk time",
              what: "Total minutes spent connected on calls.",
              formula: [formatMinutes(t.outboundMinutes) + " out", "+", formatMinutes(t.inboundMinutes) + " in", "=", "Talk time"],
              key: [SERIES_KEY.outbound, SERIES_KEY.inbound],
            },
          },
          {
            label: "Avg call",
            value: t.connected ? formatMinutes(t.avgConnectedSeconds / 60) : "—",
            icon: Timer,
            tip: {
              title: "Average call",
              what: `How long a connected call lasts on average (${t.connected} connected call${t.connected === 1 ? "" : "s"}).`,
              formula: ["Talk time", "÷", "Connected calls", "=", "Avg call"],
              use: "Longer calls usually mean more engaged prospects.",
            },
          },
        ]}
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ReportCard
          title="Calls & Conversations"
          unit={`Count per ${period}`}
          tip={{
            title: "Calls & Conversations",
            icon: BarChartIcon,
            what: `Calls made and how many became real conversations, per ${period}.`,
            formula: ["Connected call", "≥", `${threshold}s`, "=", "Convo"],
            key: [SERIES_KEY.outbound, SERIES_KEY.convos, SERIES_KEY.inbound],
            use: `Hover a bar to see the exact numbers for that ${period}.`,
          }}
        >
          <BarChart
            labels={labels}
            series={[
              { label: "Outbound", color: COLORS.outbound, values: series.outbound },
              { label: "Convos", color: COLORS.conversations, values: series.conversations },
              { label: "Inbound", color: COLORS.inbound, values: series.inbound },
            ]}
          />
          <ChartSummary
            items={[
              { label: "Outbound", value: String(t.outbound), color: COLORS.outbound },
              { label: "Conversations", value: String(t.conversations), color: COLORS.conversations },
              { label: "Inbound", value: String(t.inbound), color: COLORS.inbound },
            ]}
          />
        </ReportCard>

        <ReportCard
          title="Time Spent"
          unit="Minutes"
          tip={{
            title: "Time Spent",
            icon: Clock,
            what: `Connected minutes per ${period}, split by direction.`,
            key: [SERIES_KEY.outbound, SERIES_KEY.inbound],
            use: "Spot trends, lulls and your busiest days.",
          }}
        >
          <BarChart
            labels={labels}
            valueFormat={(v) => formatMinutes(v)}
            series={[
              { label: "Outbound", color: COLORS.outbound, values: series.outboundMinutes },
              { label: "Inbound", color: COLORS.inbound, values: series.inboundMinutes },
            ]}
          />
          <ChartSummary
            items={[
              { label: "Outbound", value: formatMinutes(t.outboundMinutes), color: COLORS.outbound },
              { label: "Inbound", value: formatMinutes(t.inboundMinutes), color: COLORS.inbound },
              ...(busiest && busiest.m > 0 ? [{ label: `Busiest · ${busiest.label}`, value: formatMinutes(busiest.m), color: "#f59e0b" }] : []),
            ]}
          />
        </ReportCard>
      </div>

      <ReportCard
        title="Calls Made"
        unit={`Outbound per ${period}`}
        tip={{
          title: "Calls Made",
          icon: PhoneOutgoing,
          what: `Outbound calls by each team member, per ${period}.`,
          formula: [`Calls in a ${period}`, "≥", String(target), "=", "Goal hit"],
          key: [
            { color: "rgba(16,185,129,0.35)", label: "Green cell", note: `reached ${target}` },
            { color: "var(--ods-bg-tertiary)", label: "Plain cell", note: "under goal" },
          ],
          use: "Change the goal in Settings → Reports.",
        }}
        aside={<GoalLink goal={goal} />}
      >
        <PivotTable columns={labels} rows={outboundGrid} goal={target} emptyText="No outbound calls in this range." />
      </ReportCard>

      <ReportCard
        title="Outbound Conversations"
        unit={`≥ ${threshold}s`}
        tip={{
          title: "Outbound Conversations",
          icon: MessageSquare,
          what: "Outbound calls long enough to be a real conversation, by team member.",
          formula: ["Connected call", "≥", `${threshold}s`, "=", "Conversation"],
          use: "Compare against Calls Made to see who turns dials into talks.",
        }}
      >
        <PivotTable columns={labels} rows={convoGrid} emptyText="No conversations in this range yet." />
      </ReportCard>
    </>
  );
}

const HEALTH_STYLE: Record<HealthLevel, { label: string; className: string; color: string; note: string }> = {
  good: { label: "Healthy", className: "bg-emerald-500/15 text-emerald-700", color: "#10b981", note: "connect ≥ 20%" },
  watch: { label: "Watch", className: "bg-amber-500/15 text-amber-700", color: "#f59e0b", note: "connect 10–20%" },
  risk: { label: "At risk", className: "bg-red-500/15 text-red-700", color: "#ef4444", note: "connect < 10%" },
  "low-data": { label: "Not enough calls", className: "bg-[var(--ods-bg-tertiary)] text-[var(--ods-text-secondary)]", color: "#9ca3af", note: "under 10 calls" },
};

const HEALTH_KEY = (Object.keys(HEALTH_STYLE) as HealthLevel[]).map((h) => ({
  color: HEALTH_STYLE[h].color,
  label: HEALTH_STYLE[h].label,
  note: HEALTH_STYLE[h].note,
}));

const CONNECT_RATE_FORMULA = ["Connected", "÷", "Calls", "=", "Connect rate"];

function NumberHealthTab({ calls, threshold }: { calls: ReportCall[]; threshold: number }) {
  const rows = numberHealth(calls, threshold);
  const count = (h: HealthLevel) => rows.filter((r) => r.health === h).length;
  const band = (h: HealthLevel) => ({
    title: HEALTH_STYLE[h].label,
    what: `Numbers with ${HEALTH_STYLE[h].note}.`,
    formula: CONNECT_RATE_FORMULA,
    key: HEALTH_KEY,
  });
  return (
    <>
      <StatTiles
        stats={[
          {
            label: "Numbers used",
            value: String(rows.length),
            icon: Phone,
            tip: { title: "Numbers used", what: "Caller IDs that dialed out in this range.", formula: ["Unique caller IDs", "=", "Numbers used"] },
          },
          { label: "Healthy", value: String(count("good")), icon: CheckCircle, tone: "positive", tip: { ...band("good"), use: "Keep dialing on these." } },
          { label: "Watch", value: String(count("watch")), icon: AlertTriangle, tone: "warning", tip: { ...band("watch"), use: "Reduce volume and keep an eye on them." } },
          {
            label: "At risk",
            value: String(count("risk")),
            icon: XCircle,
            tone: count("risk") ? "negative" : "default",
            tip: { ...band("risk"), use: "Rest or replace them: carriers may be flagging them as spam." },
          },
          {
            label: "Bad / wrong",
            value: String(rows.reduce((s, r) => s + r.badOrWrong, 0)),
            icon: Ban,
            tip: { title: "Bad / wrong", what: "Calls marked as a bad or wrong number.", formula: ["Bad number", "+", "Wrong number"], use: "Clean these leads out of your lists." },
          },
          {
            label: "No answer",
            value: String(rows.reduce((s, r) => s + r.noAnswer, 0)),
            icon: PhoneOff,
            tip: { title: "No answer", what: "Calls nobody picked up.", use: "Try other times; see the Disposition heatmap." },
          },
        ]}
      />
      <ReportCard
        title="Number Health"
        unit="By caller ID"
        tip={{
          title: "Number Health",
          icon: Phone,
          what: "How each of your numbers performs. Judged after 10 calls.",
          formula: CONNECT_RATE_FORMULA,
          key: HEALTH_KEY,
          use: "A falling connect rate often means the number is flagged as spam.",
        }}
      >
        {rows.length === 0 ? (
          <EmptyState>No outbound calls in this range.</EmptyState>
        ) : (
          <ReportTable>
            <thead>
              <tr>
                <HeadCell>Number</HeadCell>
                <HeadCell>Calls</HeadCell>
                <HeadCell tip={{ title: "Connected", icon: PhoneIncoming, what: "Calls that were answered." }}>Connected</HeadCell>
                <HeadCell tip={{ title: "Connect rate", what: "Share of calls that were answered.", formula: CONNECT_RATE_FORMULA, key: HEALTH_KEY }}>Connect rate</HeadCell>
                <HeadCell tip={{ title: "Conversations", icon: MessageSquare, what: "Answered calls that lasted long enough.", formula: ["Connected", "≥", `${threshold}s`] }}>
                  Conversations
                </HeadCell>
                <HeadCell>No answer</HeadCell>
                <HeadCell>Bad / wrong</HeadCell>
                <HeadCell>Last used</HeadCell>
                <HeadCell tip={{ title: "Health", what: "Verdict based on the connect rate.", key: HEALTH_KEY }}>Health</HeadCell>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.number} className={TR}>
                  <td className={`${TD} font-medium`}>{r.number}</td>
                  <td className={`${TD} font-semibold`}>{r.calls}</td>
                  <td className={TD}>{r.connected}</td>
                  <td className={TD}>
                    <Meter value={r.connectRate} color={HEALTH_STYLE[r.health].color} label={formatPercent(r.connectRate)} />
                  </td>
                  <td className={TD}>{r.conversations}</td>
                  <td className={TD}>{r.noAnswer}</td>
                  <td className={TD}>{r.badOrWrong}</td>
                  <td className={`${TD} text-[var(--ods-text-secondary)]`}>{r.lastUsed ? r.lastUsed.toLocaleDateString() : "—"}</td>
                  <td className={TD}>
                    <Chip dot={HEALTH_STYLE[r.health].color}>{HEALTH_STYLE[r.health].label}</Chip>
                  </td>
                </tr>
              ))}
            </tbody>
          </ReportTable>
        )}
      </ReportCard>
    </>
  );
}

/** Thick inline bar plus value, for rates and relative volume in tables. */
function Meter({ value, color = COLORS.outbound, label }: { value: number; color?: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-2.5 rounded-full bg-[var(--ods-bg-tertiary)] overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.min(1, Math.max(0, value)) * 100}%`, background: color }} />
      </div>
      <span className="font-semibold">{label}</span>
    </div>
  );
}

const POSITIVE_LIST = "Interested, Appointment Set, Callback, Good Number, Left Callback or Left Voicemail";
const POSITIVE_RATE_FORMULA = ["Positive", "÷", "Positive + Negative", "=", "Rate"];

function TeamTab({ calls, threshold }: { calls: ReportCall[]; threshold: number }) {
  const rows = teamStats(calls, threshold);
  const maxCalls = Math.max(1, ...rows.map((r) => r.outbound));
  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + f(r), 0);
  const outbound = sum((r) => r.outbound);
  const convos = sum((r) => r.conversations);
  const positive = sum((r) => r.positive);
  const decided = positive + sum((r) => r.negative);
  const top = [...rows].sort((a, b) => b.conversations - a.conversations)[0];
  return (
    <>
      <StatTiles
        stats={[
          { label: "Members", value: String(rows.length), icon: Users, tip: { title: "Members", what: "Team members who made or took a call in this range." } },
          { label: "Calls", value: String(outbound), icon: PhoneOutgoing, tip: { title: "Calls", what: "Outbound dials across the team.", formula: ["Outbound dials", "=", "Calls"] } },
          {
            label: "Conversations",
            value: String(convos),
            icon: MessageSquare,
            tone: "positive",
            tip: { title: "Conversations", what: "Calls long enough to be a real conversation.", formula: ["Connected call", "≥", `${threshold}s`] },
          },
          {
            label: "Convo rate",
            value: outbound ? formatPercent(convos / outbound) : "—",
            icon: ThumbsUp,
            tip: { title: "Convo rate", what: "Share of dials that became conversations.", formula: ["Conversations", "÷", "Calls", "=", "Convo rate"] },
          },
          {
            label: "Positive rate",
            value: decided ? formatPercent(positive / decided) : "—",
            icon: TrendingUp,
            tone: "positive",
            tip: {
              title: "Positive rate",
              what: "Of the calls with an outcome, how many ended well.",
              formula: POSITIVE_RATE_FORMULA,
              key: [
                { color: COLORS.positive, label: "Positive", note: "good outcome" },
                { color: COLORS.negative, label: "Negative", note: "bad outcome" },
              ],
            },
          },
          {
            label: "Top talker",
            value: top && top.conversations > 0 ? top.member : "—",
            icon: Star,
            tip: { title: "Top talker", what: `Most conversations in this range${top ? ` (${top.conversations})` : ""}.`, use: "Listen to their calls for coaching." },
          },
        ]}
      />
      <ReportCard
        title="Calls by Team Member"
        unit="Count"
        tip={{
          title: "Calls by Team Member",
          icon: BarChartIcon,
          what: "Outbound calls and conversations for each person.",
          key: [SERIES_KEY.outbound, SERIES_KEY.convos],
          use: "Hover a bar for exact numbers.",
        }}
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
        tip={{
          title: "Team Performance",
          icon: Users,
          what: "Who is dialing, how often calls become conversations, and how many end positively.",
          key: [
            { color: COLORS.positive, label: "Positive", note: "good outcomes" },
            { color: COLORS.negative, label: "Negative", note: "bad outcomes" },
          ],
          use: "Hover the eye on any column to see how it is worked out.",
        }}
      >
        {rows.length === 0 ? (
          <EmptyState>No calls in this range.</EmptyState>
        ) : (
          <ReportTable>
            <thead>
              <tr>
                <HeadCell>Team member</HeadCell>
                <HeadCell tip={{ title: "Calls", what: "Outbound dials. The bar compares each member with the busiest one." }}>Calls</HeadCell>
                <HeadCell tip={{ title: "Conversations", what: "Calls long enough to count.", formula: ["Connected call", "≥", `${threshold}s`] }}>Conversations</HeadCell>
                <HeadCell tip={{ title: "Convo rate", what: "Share of dials that became conversations.", formula: ["Conversations", "÷", "Calls", "=", "Rate"] }}>Convo rate</HeadCell>
                <HeadCell tip={{ title: "Talk time", what: "Total connected minutes, inbound and outbound.", key: [SERIES_KEY.outbound, SERIES_KEY.inbound] }}>Talk time</HeadCell>
                <HeadCell tip={{ title: "Avg call", what: "Average length of a connected call.", formula: ["Talk time", "÷", "Connected calls"] }}>Avg call</HeadCell>
                <HeadCell tip={{ title: "Positive", what: `${POSITIVE_LIST}.`, key: [{ color: COLORS.positive, label: "Positive outcome" }] }}>Positive</HeadCell>
                <HeadCell tip={{ title: "Negative", what: "Any other outcome, e.g. Not Interested, DNC or Bad Number.", key: [{ color: COLORS.negative, label: "Negative outcome" }] }}>
                  Negative
                </HeadCell>
                <HeadCell tip={{ title: "Positive rate", what: "Of the calls with an outcome, how many ended well.", formula: POSITIVE_RATE_FORMULA }}>Positive rate</HeadCell>
                <HeadCell tip={{ title: "Appointments", what: "Calls marked Appointment Set." }}>Appointments</HeadCell>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const d = r.positive + r.negative;
                return (
                  <tr key={r.member} className={TR}>
                    <td className={`${TD} font-semibold`}>{r.member}</td>
                    <td className={TD}>
                      <Meter value={r.outbound / maxCalls} label={String(r.outbound)} />
                    </td>
                    <td className={`${TD} font-semibold`}>{r.conversations}</td>
                    <td className={TD}>{r.outbound ? formatPercent(r.conversations / r.outbound) : "—"}</td>
                    <td className={TD}>{formatMinutes(r.outboundMinutes + r.inboundMinutes)}</td>
                    <td className={TD}>{r.connected ? formatMinutes(r.avgConnectedSeconds / 60) : "—"}</td>
                    <td className={`${TD} font-semibold text-emerald-600`}>{r.positive}</td>
                    <td className={`${TD} font-semibold text-red-600`}>{r.negative}</td>
                    <td className={TD}>{d ? <Meter value={r.positive / d} color={COLORS.positive} label={formatPercent(r.positive / d)} /> : "—"}</td>
                    <td className={`${TD} font-semibold`}>{r.appointments}</td>
                  </tr>
                );
              })}
            </tbody>
          </ReportTable>
        )}
      </ReportCard>
    </>
  );
}

const ALL_CALLS = "__all";

const OUTCOME_KEY = [
  { color: COLORS.positive, label: "Positive", note: "good outcome" },
  { color: COLORS.negative, label: "Negative / other", note: "everything else" },
];

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
  const share = (n: number) => (calls.length ? formatPercent(n / calls.length) : "—");

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
            icon: <DispositionIcon status={d.status} className="w-4 h-4" />,
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
          { label: "Calls", value: String(calls.length), icon: Phone, tip: { title: "Calls", what: "All calls in this range, inbound and outbound." } },
          {
            label: "Positive",
            value: String(positive),
            icon: CheckCircle,
            tone: "positive",
            tip: { title: "Positive", what: `${POSITIVE_LIST}.`, formula: [String(positive), "÷", String(calls.length), "=", share(positive)] },
          },
          {
            label: "Negative",
            value: String(negative),
            icon: XCircle,
            tone: "negative",
            tip: { title: "Negative", what: "Every other outcome.", formula: [String(negative), "÷", String(calls.length), "=", share(negative)] },
          },
          {
            label: "Appointments",
            value: String(calls.filter((c) => String(c.status).toUpperCase() === "APPOINTMENT_SET").length),
            icon: CalendarDays,
            tone: "positive",
            tip: { title: "Appointments", what: "Calls marked Appointment Set." },
          },
          {
            label: "Do not contact",
            value: String(calls.filter((c) => String(c.status).toUpperCase() === "DNC").length),
            icon: Ban,
            tone: "negative",
            tip: { title: "Do not contact", what: "Prospects who asked not to be called again." },
          },
          {
            label: selectedLabel,
            value: String(focus.length),
            icon: ThumbsUp,
            tip: { title: selectedLabel, what: "Calls matching the disposition picked on the heatmap below." },
          },
        ]}
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ReportCard
          title="Disposition Distribution"
          unit="Count"
          tip={{ title: "Disposition Distribution", icon: BarChartIcon, what: "How calls ended, one bar per disposition.", key: OUTCOME_KEY, use: "Hover a bar for the count." }}
        >
          <BarChart
            labels={breakdown.map((r) => r.label)}
            series={[
              { label: "Positive", color: COLORS.positive, values: breakdown.map((r) => (r.type === "positive" ? r.count : 0)) },
              { label: "Negative / other", color: COLORS.negative, values: breakdown.map((r) => (r.type === "positive" ? 0 : r.count)) },
            ]}
          />
        </ReportCard>
        <ReportCard
          title="Average Call Length"
          unit="Minutes"
          tip={{
            title: "Average Call Length by Disposition",
            icon: Timer,
            what: "How long calls with each outcome last on average.",
            formula: ["Talk time", "÷", "Calls", "per", "Disposition"],
            use: "Longer calls usually mean more engaged prospects.",
          }}
        >
          <BarChart
            labels={breakdown.map((r) => r.label)}
            valueFormat={(v) => formatMinutes(v)}
            series={[{ label: "Average length", color: COLORS.outbound, values: breakdown.map((r) => r.avgSeconds / 60) }]}
          />
        </ReportCard>
      </div>

      <ReportCard
        title="Disposition Breakdown"
        unit="Numbers"
        tip={{ title: "Disposition Breakdown", icon: ThumbsUp, what: "Every disposition with its count, share of calls and average length.", key: OUTCOME_KEY }}
      >
        {breakdown.length === 0 ? (
          <EmptyState>No calls in this range.</EmptyState>
        ) : (
          <ReportTable>
            <thead>
              <tr>
                <HeadCell>Disposition</HeadCell>
                <HeadCell tip={{ title: "Type", what: "Whether the outcome counts as positive or negative.", key: OUTCOME_KEY }}>Type</HeadCell>
                <HeadCell>Calls</HeadCell>
                <HeadCell tip={{ title: "Share", what: "This disposition's slice of all calls.", formula: ["Disposition calls", "÷", "All calls", "=", "Share"] }}>Share</HeadCell>
                <HeadCell tip={{ title: "Avg length", what: "Average talk time for this outcome." }}>Avg length</HeadCell>
              </tr>
            </thead>
            <tbody>
              {breakdown.map((r) => {
                const color = r.type === "positive" ? COLORS.positive : r.type === "negative" ? COLORS.negative : "#9ca3af";
                return (
                  <tr key={r.status} className={TR}>
                    <td className={TD}>
                      <DispositionBadge status={r.status} />
                    </td>
                    <td className={`${TD} capitalize text-[var(--ods-text-secondary)]`}>{r.type ?? "—"}</td>
                    <td className={`${TD} font-semibold`}>{r.count}</td>
                    <td className={TD}>
                      <Meter value={r.share} color={color} label={formatPercent(r.share)} />
                    </td>
                    <td className={TD}>{formatMinutes(r.avgSeconds / 60)}</td>
                  </tr>
                );
              })}
            </tbody>
          </ReportTable>
        )}
      </ReportCard>

      <ReportCard
        title="Disposition Heatmap"
        unit="Weekday × hour"
        tip={{
          title: "Disposition Heatmap",
          icon: CalendarDays,
          what: `When "${selectedLabel}" calls happen, by weekday and hour.`,
          key: [
            { color: "var(--ods-bg-tertiary)", label: "Empty", note: "no calls" },
            { color: "rgba(37,99,235,0.35)", label: "Light blue", note: "a few" },
            { color: "rgba(37,99,235,1)", label: "Dark blue", note: "the most" },
          ],
          use: "Find the best times to dial. Pick a disposition on the right.",
        }}
        aside={picker}
      >
        <Heatmap grid={heatmap(focus)} />
      </ReportCard>
    </>
  );
}
