import { twentyLinks, useTwentyBaseUrl } from "@/lib/twenty/links";
import { Chip } from "@/components/ui/Chip";
import { HeadCell, ReportTable, TD, TR } from "@/components/reports/ReportParts";
import { ExternalLink, Users } from "@/components/ui/icons";
import type { TipSpec } from "@/components/ui/InfoTip";
import { ACTIONS, OBJECTS, UNATTRIBUTED, fieldLabel, formatValue, timeAgo, type AdminAction, type ResolvedActivity } from "@/lib/admin";

/*
 * The activity table and its legends, shared by the Admin page and the call
 * review page so both read events the same way: same colours, same "who"
 * attribution, same before -> after chips.
 */

const ACTION_KEYS = Object.keys(ACTIONS) as AdminAction[];

export const ACTION_KEY_TIP: TipSpec["key"] = ACTION_KEYS.filter((a) => a !== "restored").map((a) => ({
  color: ACTIONS[a].color,
  label: ACTIONS[a].label,
  note: a === "created" ? "new record" : a === "updated" ? "fields changed" : "record removed",
}));

export const WHO_TIP: TipSpec = {
  title: "Who",
  icon: Users,
  what: "Twenty logs every dialer write under the dialer's API key, so most events do not name a person. Each event is credited to the person who created the record it touched.",
  formula: ["Event", "→", "Record", "→", "Record creator"],
  use: `"${UNATTRIBUTED}" means Twenty has no person for that record (e.g. phone numbers).`,
};

export function ActionBadge({ action }: { action: AdminAction }) {
  return (
    <Chip icon={ACTIONS[action].icon} iconClassName={ACTIONS[action].iconClassName}>
      {ACTIONS[action].label}
    </Chip>
  );
}

export function ActivityTable({ events, compact = false }: { events: ResolvedActivity[]; compact?: boolean }) {
  const twentyBase = useTwentyBaseUrl();
  return (
    <ReportTable>
      <thead>
        <tr>
          <HeadCell>When</HeadCell>
          <HeadCell tip={WHO_TIP}>Who</HeadCell>
          <HeadCell tip={{ title: "Action", what: "What happened to the record.", key: ACTION_KEY_TIP }}>Action</HeadCell>
          <HeadCell>Record</HeadCell>
          {!compact && (
            <HeadCell className="min-w-[380px]" tip={{ title: "Changes", what: "For updates, each field that changed, shown as before → after." }}>
              Changes
            </HeadCell>
          )}
        </tr>
      </thead>
      <tbody>
        {events.map((e) => {
          const Icon = OBJECTS[e.object].icon;
          return (
            <tr key={e.id} className={TR}>
              <td className={`${TD} text-[var(--ods-text-secondary)]`} title={new Date(e.happensAt).toLocaleString()}>
                {timeAgo(e.happensAt)}
              </td>
              <td className={`${TD} font-semibold ${e.who === UNATTRIBUTED ? "text-[var(--ods-text-tertiary)] font-normal" : ""}`}>{e.who}</td>
              <td className={TD}>
                <ActionBadge action={e.action} />
              </td>
              <td className={`${TD} max-w-[240px]`}>
                <span className="inline-flex items-center gap-2 min-w-0 max-w-full">
                  <Icon className="w-3.5 h-3.5 shrink-0 text-[var(--ods-text-tertiary)]" />
                  <span className="shrink-0 text-[12px] font-semibold text-[var(--ods-text-secondary)]">{OBJECTS[e.object].singular}</span>
                  {e.recordId ? (
                    <a
                      href={twentyLinks.record(twentyBase, OBJECTS[e.object].twentySingular, e.recordId)}
                      target="_blank"
                      rel="noreferrer"
                      title={`Open this ${OBJECTS[e.object].singular.toLowerCase()} in Twenty`}
                      className="min-w-0 inline-flex items-center gap-1 font-medium hover:text-[var(--ods-brand-600)] hover:underline"
                    >
                      <span className="truncate">{e.name}</span>
                      <ExternalLink className="w-3 h-3 shrink-0 text-[var(--ods-text-tertiary)]" />
                    </a>
                  ) : (
                    <span className="truncate font-medium">{e.name}</span>
                  )}
                </span>
              </td>
              {!compact && (
                <td className={`${TD} min-w-[380px] whitespace-normal py-1.5`}>
                  {e.changes.length === 0 ? (
                    <span className="text-[var(--ods-text-tertiary)]">—</span>
                  ) : (
                    <span className="flex flex-wrap gap-1">
                      {e.changes.slice(0, 4).map((c) => (
                        <span
                          key={c.field}
                          title={`${fieldLabel(c.field)}: ${formatValue(c.before, c.field)} → ${formatValue(c.after, c.field)}`}
                          className="inline-flex items-center gap-1 max-w-[340px] px-2 py-0.5 rounded-md border border-[var(--ods-border)] bg-[var(--ods-bg-secondary)] text-[12px]"
                        >
                          <b className="shrink-0">{fieldLabel(c.field)}</b>
                          <span className="truncate text-[var(--ods-text-tertiary)] line-through">{formatValue(c.before, c.field)}</span>
                          <span className="shrink-0 text-[var(--ods-text-tertiary)]">→</span>
                          <span className="truncate font-medium">{formatValue(c.after, c.field)}</span>
                        </span>
                      ))}
                      {e.changes.length > 4 && <span className="text-[12px] font-semibold text-[var(--ods-text-secondary)]">+{e.changes.length - 4} more</span>}
                    </span>
                  )}
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </ReportTable>
  );
}
