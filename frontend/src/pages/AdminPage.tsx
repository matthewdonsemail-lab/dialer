import { AdminBodySkeleton } from "@/components/ui/PageSkeletons";
import { Skeleton } from "@/components/ui/Skeleton";
import { TabBar } from "@/components/ui/TabBar";
import { twentyLinks, useTwentyBaseUrl } from "@/lib/twenty/links";
import { useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  CalendarDays,
  Clock,
  Database,
  ExternalLink,
  Settings,
  Shield,
  Users,
  type IconComponent,
} from "@/components/ui/icons";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { SelectMenu } from "@/components/ui/Menu";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { BarChart } from "@/components/reports/BarChart";
import {
  ChartSummary,
  EmptyState,
  HeadCell,
  ReportCard,
  ReportTable,
  StatTiles,
  TD,
  TR,
  TWO_LINE_TRIGGER_CLASS,
  TwoLineTrigger,
} from "@/components/reports/ReportParts";
import { ACTION_KEY_TIP, ActionBadge, ActivityTable, WHO_TIP } from "@/components/admin/ActivityTable";
import { RANGE_LABELS, bucketsFor, formatRange, rangeFor, type RangePreset } from "@/lib/reports";
import {
  ACTIONS,
  OBJECTS,
  UNATTRIBUTED,
  countBy,
  inBucket,
  recordIndex,
  resolveActivities,
  timeAgo,
  useAdminActivity,
  useDialerRecords,
  type AdminAction,
  type AdminObject,
  type DialerRecords,
  type ResolvedActivity,
} from "@/lib/admin";

type Tab = "overview" | "activity" | "team" | "objects";
const TABS: { key: Tab; label: string; icon: IconComponent }[] = [
  { key: "overview", label: "Overview", icon: BarChart3 },
  { key: "activity", label: "Activity Log", icon: Activity },
  { key: "team", label: "Team Activity", icon: Users },
  { key: "objects", label: "Data Objects", icon: Database },
];

const ACTION_KEYS = Object.keys(ACTIONS) as AdminAction[];
const OBJECT_KEYS = Object.keys(OBJECTS) as AdminObject[];
const ALL = "__all";

/**
 * Admin: what happened to the dialer's data and who did it. Same frame as
 * Reports (date range, tabs, stat tiles, cards with eye tooltips), fed by
 * Twenty's timeline activity for every dialer object.
 */
export function AdminPage() {
  const [tab, setTab] = usePersistedState<Tab>("admin-tab", "overview");
  const [preset, setPreset] = usePersistedState<RangePreset>("admin-range", "last7");
  const range = useMemo(() => rangeFor(preset), [preset]);
  const { data, isLoading, error } = useAdminActivity(range);
  const records = useDialerRecords(data);

  const events = useMemo(
    () =>
      resolveActivities(data, records).filter((a) => {
        const t = new Date(a.happensAt).getTime();
        return t >= range.start.getTime() && t < range.end.getTime();
      }),
    [data, records, range],
  );

  return (
    <div className="flex flex-col h-full min-h-0 overflow-y-auto bg-[var(--ods-bg-secondary)]">
      <div className="px-5 pt-5 pb-3 flex flex-wrap items-center justify-between gap-3">
        <SectionTitle
          as="h1"
          title="Admin"
          pill={isLoading ? <Skeleton className="h-3 w-14" /> : `${events.length} events`}
          info={{
            title: "Admin",
            icon: Shield,
            what: "Every create, update and delete on the dialer's data in Twenty, and who did it.",
            formula: ["Twenty activity", "+", "Record creators", "=", "Who did what"],
            use: "Pick a date range on the right; every tab updates.",
          }}
        />
        <SelectMenu
          value={preset}
          onChange={(v) => setPreset(v as RangePreset)}
          placement="bottom-end"
          sections={[{ title: "Date range", options: (Object.keys(RANGE_LABELS) as RangePreset[]).map((k) => ({ value: k, label: RANGE_LABELS[k] })) }]}
          triggerClassName={TWO_LINE_TRIGGER_CLASS}
          trigger={<TwoLineTrigger icon={CalendarDays} caption={`Date Range · ${RANGE_LABELS[preset]}`} value={formatRange(range)} />}
        />
      </div>

      <div className="px-5">
        <TabBar tabs={TABS} value={tab} onChange={setTab} />
      </div>

      <div className="p-5 space-y-4">
        {error ? (
          <EmptyState>Could not load activity from Twenty. {(error as Error).message}</EmptyState>
        ) : isLoading ? (
          <AdminBodySkeleton tab={tab} />
        ) : (
          <>
            {data?.truncated && (
              <p className="rounded-[8px] border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[13px] font-medium text-amber-700">
                This range has more events than one load returns, so the oldest are left out. Pick a shorter range for complete numbers.
              </p>
            )}
            {tab === "overview" ? (
              <Overview events={events} range={range} records={records} />
            ) : tab === "activity" ? (
              <ActivityLog events={events} loading={isLoading} />
            ) : tab === "team" ? (
              <TeamActivity events={events} records={records} range={range} />
            ) : (
              <DataObjects events={events} records={records} members={data?.members ?? {}} range={range} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Overview */

function Overview({ events, range, records }: { events: ResolvedActivity[]; range: ReturnType<typeof rangeFor>; records: DialerRecords }) {
  const buckets = useMemo(() => bucketsFor(range), [range]);
  const byAction = countBy(events, (e) => e.action);
  const byObject = countBy(events, (e) => e.object);
  const people = new Set(events.map((e) => e.who).filter((w) => w !== UNATTRIBUTED));
  const busiest = [...byObject.entries()].sort((a, b) => b[1] - a[1])[0];
  const totalRecords = Object.values(records.totals).reduce((a, b) => a + b, 0);
  const objectsShown = OBJECT_KEYS.filter((o) => byObject.get(o));

  return (
    <>
      <StatTiles
        stats={[
          {
            label: "Events",
            value: String(events.length),
            icon: Activity,
            tip: { title: "Events", what: "Every create, update and delete on dialer records in this range.", formula: ["Created", "+", "Updated", "+", "Deleted"], key: ACTION_KEY_TIP },
          },
          { label: "Created", value: String(byAction.get("created") ?? 0), icon: ACTIONS.created.icon, tone: "positive", tip: { title: "Created", what: "New records added: calls, contacts, campaigns, scripts..." } },
          { label: "Updated", value: String(byAction.get("updated") ?? 0), icon: ACTIONS.updated.icon, tip: { title: "Updated", what: "Edits to existing records. Hover a row in the Activity Log to see before → after." } },
          {
            label: "Deleted",
            value: String(byAction.get("deleted") ?? 0),
            icon: ACTIONS.deleted.icon,
            tone: byAction.get("deleted") ? "negative" : "default",
            tip: { title: "Deleted", what: "Records removed. Twenty keeps them in its trash, so they can be restored there." },
          },
          { label: "People", value: String(people.size), icon: Users, tip: { ...WHO_TIP, title: "People", what: "Team members credited with at least one event in this range." } },
          {
            label: "Records",
            value: totalRecords.toLocaleString(),
            icon: Database,
            tip: { title: "Records", what: "Everything the dialer stores in Twenty right now, across all objects.", use: "See the split in Data Objects." },
          },
        ]}
      />

      <ReportCard
        title="Activity Over Time"
        unit={buckets[0]?.label.startsWith("Wk") ? "Per week" : "Per day"}
        tip={{ title: "Activity Over Time", icon: BarChart3, what: "How many records were created, updated and deleted each day.", key: ACTION_KEY_TIP, use: "Spikes show imports, dial sessions or clean-ups. Hover a bar for numbers." }}
      >
        <BarChart
          labels={buckets.map((b) => b.label)}
          series={ACTION_KEYS.filter((a) => a !== "restored").map((a) => ({
            label: ACTIONS[a].label,
            color: ACTIONS[a].color,
            values: buckets.map((b) => events.filter((e) => e.action === a && inBucket(e, b)).length),
          }))}
        />
        <ChartSummary
          items={ACTION_KEYS.filter((a) => a !== "restored").map((a) => ({ label: ACTIONS[a].label, value: String(byAction.get(a) ?? 0), color: ACTIONS[a].color }))}
        />
      </ReportCard>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ReportCard
          title="Activity by Object"
          unit="Count"
          tip={{ title: "Activity by Object", icon: Database, what: "Which kinds of record are changing the most.", key: ACTION_KEY_TIP }}
          aside={busiest ? <span className="text-[13px] font-semibold text-[var(--ods-text-secondary)]">Busiest: {OBJECTS[busiest[0] as AdminObject].label}</span> : undefined}
        >
          {objectsShown.length === 0 ? (
            <EmptyState>No activity in this range.</EmptyState>
          ) : (
            <BarChart
              labels={objectsShown.map((o) => OBJECTS[o].label)}
              series={ACTION_KEYS.filter((a) => a !== "restored").map((a) => ({
                label: ACTIONS[a].label,
                color: ACTIONS[a].color,
                values: objectsShown.map((o) => events.filter((e) => e.object === o && e.action === a).length),
              }))}
            />
          )}
        </ReportCard>

        <ReportCard title="Latest Changes" unit="Newest first" tip={{ title: "Latest Changes", icon: Clock, what: "The ten most recent events. The Activity Log tab has the full list with filters." }}>
          {events.length === 0 ? <EmptyState>No activity in this range.</EmptyState> : <ActivityTable events={events.slice(0, 10)} compact />}
        </ReportCard>
      </div>
    </>
  );
}

/* ------------------------------------------------------------ Activity Log */

const PAGE = 100;

function ActivityLog({ events, loading }: { events: ResolvedActivity[]; loading: boolean }) {
  const [action, setAction] = usePersistedState<string>("admin-log-action", ALL);
  const [object, setObject] = usePersistedState<string>("admin-log-object", ALL);
  const [who, setWho] = useState<string>(ALL);
  const [shown, setShown] = useState(PAGE);

  const people = [...new Set(events.map((e) => e.who))].sort();
  const filtered = events.filter(
    (e) => (action === ALL || e.action === action) && (object === ALL || e.object === object) && (who === ALL || e.who === who),
  );

  return (
    <ReportCard
      title="Activity Log"
      unit={loading ? <Skeleton className="h-3 w-14" /> : `${filtered.length} events`}
      tip={{
        title: "Activity Log",
        icon: Activity,
        what: "Every change to dialer records: when, who, what happened, and which fields changed.",
        key: ACTION_KEY_TIP,
        use: "Filter by action, object or person on the right.",
      }}
      aside={
        <div className="flex flex-wrap justify-end gap-2">
          <SelectMenu
            value={action}
            onChange={(v) => {
              setAction(v);
              setShown(PAGE);
            }}
            placement="bottom-end"
            sections={[
              { options: [{ value: ALL, label: "All actions" }] },
              { title: "Action", options: ACTION_KEYS.map((a) => ({ value: a, label: ACTIONS[a].label, dot: "", icon: <ActionDot action={a} /> })) },
            ]}
            triggerClassName={TWO_LINE_TRIGGER_CLASS}
            trigger={<TwoLineTrigger icon={Activity} caption="Action" value={action === ALL ? "All actions" : ACTIONS[action as AdminAction].label} />}
          />
          <SelectMenu
            value={object}
            onChange={(v) => {
              setObject(v);
              setShown(PAGE);
            }}
            placement="bottom-end"
            sections={[
              { options: [{ value: ALL, label: "All objects" }] },
              { title: "Object", options: OBJECT_KEYS.map((o) => ({ value: o, label: OBJECTS[o].label, icon: <ObjectIcon object={o} /> })) },
            ]}
            triggerClassName={TWO_LINE_TRIGGER_CLASS}
            trigger={<TwoLineTrigger icon={Database} caption="Object" value={object === ALL ? "All objects" : OBJECTS[object as AdminObject].label} />}
          />
          <SelectMenu
            value={who}
            onChange={(v) => {
              setWho(v);
              setShown(PAGE);
            }}
            placement="bottom-end"
            searchable={people.length > 8}
            sections={[{ options: [{ value: ALL, label: "Everyone" }] }, { title: "Person", options: people.map((p) => ({ value: p, label: p })) }]}
            triggerClassName={TWO_LINE_TRIGGER_CLASS}
            trigger={<TwoLineTrigger icon={Users} caption="Who" value={who === ALL ? "Everyone" : who} />}
          />
        </div>
      }
    >
      {filtered.length === 0 ? (
        <EmptyState>No events match these filters.</EmptyState>
      ) : (
        <>
          <ActivityTable events={filtered.slice(0, shown)} />
          {filtered.length > shown && (
            <div className="mt-3 flex justify-center">
              <button
                onClick={() => setShown((n) => n + PAGE)}
                className="h-9 px-4 rounded-[8px] border border-[var(--ods-border-strong)] text-[13px] font-semibold text-[var(--ods-text-primary)] hover:bg-[var(--ods-hover)]"
              >
                Show {Math.min(PAGE, filtered.length - shown)} more
              </button>
            </div>
          )}
        </>
      )}
    </ReportCard>
  );
}

function ActionDot({ action }: { action: AdminAction }) {
  return <span className="ods-menu-dot" style={{ background: ACTIONS[action].color }} />;
}

function ObjectIcon({ object }: { object: AdminObject }) {
  const Icon = OBJECTS[object].icon;
  return <Icon className="ods-menu-icon" />;
}

/* ----------------------------------------------------------- Team Activity */

function TeamActivity({ events, records, range }: { events: ResolvedActivity[]; records: DialerRecords; range: ReturnType<typeof rangeFor> }) {
  const callsInRange = records.calls.filter((c) => {
    const t = new Date(c.startedAt ?? c.created_at).getTime();
    return t >= range.start.getTime() && t < range.end.getTime();
  });
  const callsBy = countBy(callsInRange, (c) => c.createdBy?.name || UNATTRIBUTED);
  const names = [...new Set([...events.map((e) => e.who), ...callsBy.keys()])];
  const rows = names
    .map((who) => {
      const mine = events.filter((e) => e.who === who);
      const a = countBy(mine, (e) => e.action);
      return {
        who,
        created: a.get("created") ?? 0,
        updated: a.get("updated") ?? 0,
        deleted: a.get("deleted") ?? 0,
        total: mine.length,
        calls: callsBy.get(who) ?? 0,
        objects: [...new Set(mine.map((e) => e.object))],
        last: mine[0]?.happensAt ?? null,
      };
    })
    .sort((x, y) => (x.who === UNATTRIBUTED ? 1 : y.who === UNATTRIBUTED ? -1 : y.total - x.total));
  const named = rows.filter((r) => r.who !== UNATTRIBUTED);
  const max = Math.max(1, ...rows.map((r) => r.total));
  const top = named[0];

  return (
    <>
      <StatTiles
        stats={[
          { label: "People", value: String(named.length), icon: Users, tip: { ...WHO_TIP, title: "People", what: "Team members credited with events or calls in this range." } },
          { label: "Most active", value: top?.who ?? "—", icon: Activity, tip: { title: "Most active", what: `Most events in this range${top ? ` (${top.total})` : ""}.` } },
          { label: "Created", value: String(rows.reduce((s, r) => s + r.created, 0)), icon: ACTIONS.created.icon, tone: "positive", tip: { title: "Created", what: "Records created by the team." } },
          { label: "Updated", value: String(rows.reduce((s, r) => s + r.updated, 0)), icon: ACTIONS.updated.icon, tip: { title: "Updated", what: "Edits made by the team." } },
          {
            label: "Deleted",
            value: String(rows.reduce((s, r) => s + r.deleted, 0)),
            icon: ACTIONS.deleted.icon,
            tone: rows.some((r) => r.deleted) ? "negative" : "default",
            tip: { title: "Deleted", what: "Records the team removed." },
          },
          {
            label: "Unattributed",
            value: String(rows.find((r) => r.who === UNATTRIBUTED)?.total ?? 0),
            icon: Shield,
            tip: { ...WHO_TIP, title: "Unattributed", what: "Events on records with no known creator, such as phone number status changes made by the dialer." },
          },
        ]}
      />
      <ReportCard
        title="Activity by Person"
        unit="Events"
        tip={{ title: "Activity by Person", icon: BarChart3, what: "Creates, updates and deletes credited to each person.", key: ACTION_KEY_TIP }}
      >
        {rows.length === 0 ? (
          <EmptyState>No activity in this range.</EmptyState>
        ) : (
          <BarChart
            labels={rows.map((r) => r.who)}
            series={ACTION_KEYS.filter((a) => a !== "restored").map((a) => ({
              label: ACTIONS[a].label,
              color: ACTIONS[a].color,
              values: rows.map((r) => r[a as "created" | "updated" | "deleted"]),
            }))}
          />
        )}
      </ReportCard>
      <ReportCard title="Team Activity" unit="By person" tip={{ ...WHO_TIP, title: "Team Activity", what: "What each person did to the dialer's data in this range, next to the calls they made." }}>
        {rows.length === 0 ? (
          <EmptyState>No activity in this range.</EmptyState>
        ) : (
          <ReportTable>
            <thead>
              <tr>
                <HeadCell tip={WHO_TIP}>Person</HeadCell>
                <HeadCell tip={{ title: "Events", what: "All creates, updates and deletes. The bar compares each person with the most active one." }}>Events</HeadCell>
                <HeadCell>Created</HeadCell>
                <HeadCell>Updated</HeadCell>
                <HeadCell>Deleted</HeadCell>
                <HeadCell tip={{ title: "Calls made", what: "Calls this person placed in the range, from the call records." }}>Calls made</HeadCell>
                <HeadCell tip={{ title: "Objects touched", what: "Which kinds of record this person changed." }}>Objects touched</HeadCell>
                <HeadCell>Last active</HeadCell>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.who} className={TR}>
                  <td className={`${TD} ${r.who === UNATTRIBUTED ? "text-[var(--ods-text-tertiary)]" : "font-semibold"}`}>{r.who}</td>
                  <td className={TD}>
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-2.5 rounded-md bg-[var(--ods-bg-tertiary)] overflow-hidden">
                        <div className="h-full rounded-md bg-[var(--ods-brand-600)]" style={{ width: `${(r.total / max) * 100}%` }} />
                      </div>
                      <span className="font-semibold">{r.total}</span>
                    </div>
                  </td>
                  <td className={`${TD} font-semibold text-emerald-600`}>{r.created}</td>
                  <td className={`${TD} font-semibold text-blue-600`}>{r.updated}</td>
                  <td className={`${TD} font-semibold ${r.deleted ? "text-red-600" : ""}`}>{r.deleted}</td>
                  <td className={`${TD} font-semibold`}>{r.calls}</td>
                  <td className={TD}>
                    <span className="inline-flex items-center gap-1.5">
                      {r.objects.map((o) => {
                        const Icon = OBJECTS[o].icon;
                        return (
                          <span key={o} title={OBJECTS[o].label} className="w-6 h-6 rounded-md flex items-center justify-center bg-blue-500/10 text-blue-600">
                            <Icon className="w-3 h-3" />
                          </span>
                        );
                      })}
                      {r.objects.length === 0 && <span className="text-[var(--ods-text-tertiary)]">—</span>}
                    </span>
                  </td>
                  <td className={`${TD} text-[var(--ods-text-secondary)]`} title={r.last ? new Date(r.last).toLocaleString() : undefined}>
                    {r.last ? timeAgo(r.last) : "—"}
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

/* ------------------------------------------------------------ Data Objects */

function DataObjects({
  events,
  records,
  members,
  range,
}: {
  events: ResolvedActivity[];
  records: DialerRecords;
  members: Record<string, string>;
  range: ReturnType<typeof rangeFor>;
}) {
  const index = recordIndex(records, members);
  const twentyBase = useTwentyBaseUrl();
  const rows = OBJECT_KEYS.map((o) => {
    const mine = events.filter((e) => e.object === o);
    const a = countBy(mine, (e) => e.action);
    // Contacts are too many to hold in the browser: their totals and creator
    // coverage come from server counts and "new" from the activity log.
    const contacts = o === "prospect" || o === "lead";
    const all = [...index[o].values()];
    const total = records.totals[o];
    const newInRange = contacts
      ? (a.get("created") ?? 0)
      : all.filter((r) => {
          const t = r.createdAt ? new Date(r.createdAt).getTime() : NaN;
          return t >= range.start.getTime() && t < range.end.getTime();
        }).length;
    const withOwner =
      o === "prospect" && records.prospectsWithCreator != null ? records.prospectsWithCreator : contacts ? null : all.filter((r) => r.owner).length;
    return {
      object: o,
      total,
      newInRange,
      updated: a.get("updated") ?? 0,
      deleted: a.get("deleted") ?? 0,
      last: mine[0] ?? null,
      attributed: withOwner == null ? null : total ? withOwner / total : 0,
    };
  });
  const total = rows.reduce((s, r) => s + r.total, 0);
  const max = Math.max(1, ...rows.map((r) => r.total));

  return (
    <>
      <StatTiles
        stats={[
          { label: "Objects", value: String(rows.length), icon: Database, tip: { title: "Objects", what: "Kinds of record the dialer keeps in Twenty." } },
          { label: "Records", value: total.toLocaleString(), icon: Database, tip: { title: "Records", what: "All dialer records in Twenty right now." } },
          {
            label: "New in range",
            value: String(rows.reduce((s, r) => s + r.newInRange, 0)),
            icon: ACTIONS.created.icon,
            tone: "positive",
            tip: { title: "New in range", what: "Records whose creation date falls in the selected range." },
          },
          { label: "Updated", value: String(rows.reduce((s, r) => s + r.updated, 0)), icon: ACTIONS.updated.icon, tip: { title: "Updated", what: "Update events across all objects in the range." } },
          {
            label: "Deleted",
            value: String(rows.reduce((s, r) => s + r.deleted, 0)),
            icon: ACTIONS.deleted.icon,
            tone: rows.some((r) => r.deleted) ? "negative" : "default",
            tip: { title: "Deleted", what: "Delete events across all objects in the range." },
          },
          {
            label: "Most changed",
            value: [...rows].sort((x, y) => y.updated + y.deleted - (x.updated + x.deleted))[0]?.updated ? OBJECTS[[...rows].sort((x, y) => y.updated + y.deleted - (x.updated + x.deleted))[0].object].label : "—",
            icon: Activity,
            tip: { title: "Most changed", what: "The object with the most updates and deletes in the range." },
          },
        ]}
      />
      <ReportCard
        title="Data Objects"
        unit="Twenty metadata"
        tip={{
          title: "Data Objects",
          icon: Database,
          what: "Each kind of record the dialer stores in Twenty: how many exist, what changed in the range, and when it last changed.",
          key: ACTION_KEY_TIP,
          use: "Creator coverage shows how much of each object can be traced to a person.",
        }}
      >
        <ReportTable>
          <thead>
            <tr>
              <HeadCell>Object</HeadCell>
              <HeadCell tip={{ title: "Twenty object", what: "The object's API name in Twenty. Click it to open the object's data model in Twenty settings; click the object to open its records." }}>
                Twenty object
              </HeadCell>
              <HeadCell tip={{ title: "Records", what: "How many exist now. The bar compares objects." }}>Records</HeadCell>
              <HeadCell tip={{ title: "New in range", what: "Records created in the selected range." }}>New</HeadCell>
              <HeadCell>Updated</HeadCell>
              <HeadCell>Deleted</HeadCell>
              <HeadCell tip={{ title: "Creator coverage", what: "Share of records that name the person who created them.", formula: ["Records with creator", "÷", "Records"] }}>
                Creator coverage
              </HeadCell>
              <HeadCell tip={{ title: "Last change", what: "The latest event on this object in the range, and who it is credited to." }}>Last change</HeadCell>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const Icon = OBJECTS[r.object].icon;
              return (
                <tr key={r.object} className={TR}>
                  <td className={`${TD} font-semibold`}>
                    <a
                      href={twentyLinks.records(twentyBase, OBJECTS[r.object].twenty)}
                      target="_blank"
                      rel="noreferrer"
                      title={`Open ${OBJECTS[r.object].label} in Twenty`}
                      className="inline-flex items-center gap-1.5 hover:text-[var(--ods-brand-600)] hover:underline"
                    >
                      <span className="w-7 h-7 rounded-md flex items-center justify-center bg-blue-500/15 text-blue-600">
                        <Icon className="w-3.5 h-3.5" />
                      </span>
                      {OBJECTS[r.object].label}
                      <ExternalLink className="w-3 h-3 text-[var(--ods-text-tertiary)]" />
                    </a>
                  </td>
                  <td className={`${TD} text-[var(--ods-text-secondary)]`}>
                    <a
                      href={twentyLinks.settings(twentyBase, OBJECTS[r.object].twenty)}
                      target="_blank"
                      rel="noreferrer"
                      title={`Open the ${OBJECTS[r.object].twenty} data model in Twenty settings`}
                      className="inline-flex items-center gap-1.5 hover:text-[var(--ods-brand-600)] hover:underline"
                    >
                      {OBJECTS[r.object].twenty}
                      <Settings className="w-3 h-3 text-[var(--ods-text-tertiary)]" />
                    </a>
                  </td>
                  <td className={TD}>
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-2.5 rounded-md bg-[var(--ods-bg-tertiary)] overflow-hidden">
                        <div className="h-full rounded-md bg-[var(--ods-brand-600)]" style={{ width: `${(r.total / max) * 100}%` }} />
                      </div>
                      <span className="font-semibold">{r.total.toLocaleString()}</span>
                    </div>
                  </td>
                  <td className={`${TD} font-semibold ${r.newInRange ? "text-emerald-600" : ""}`}>{r.newInRange}</td>
                  <td className={`${TD} font-semibold ${r.updated ? "text-blue-600" : ""}`}>{r.updated}</td>
                  <td className={`${TD} font-semibold ${r.deleted ? "text-red-600" : ""}`}>{r.deleted}</td>
                  <td className={TD}>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-2.5 rounded-md bg-[var(--ods-bg-tertiary)] overflow-hidden">
                        <div className="h-full rounded-md bg-emerald-500" style={{ width: `${(r.attributed ?? 0) * 100}%` }} />
                      </div>
                      <span className="font-semibold">{r.total && r.attributed != null ? `${Math.round(r.attributed * 100)}%` : "—"}</span>
                    </div>
                  </td>
                  <td className={TD}>
                    {r.last ? (
                      <span className="inline-flex items-center gap-2" title={new Date(r.last.happensAt).toLocaleString()}>
                        <ActionBadge action={r.last.action} />
                        <span className="text-[var(--ods-text-secondary)]">{timeAgo(r.last.happensAt)}</span>
                        <span className="font-medium truncate max-w-[140px]">{r.last.who === UNATTRIBUTED ? "" : `by ${r.last.who}`}</span>
                      </span>
                    ) : (
                      <span className="text-[var(--ods-text-tertiary)]">No changes in range</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </ReportTable>
      </ReportCard>
    </>
  );
}
