import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, BarChart3, BookOpen, Check, FileText, Globe, Pencil, Plus, X, type IconComponent } from "@/components/ui/icons";
import { CallScriptViewer } from "@/components/scripts/CallScriptViewer";
import { SendWebsiteWidget } from "@/components/website/SendWebsiteWidget";
import { formatDuration } from "@/components/dialer/DialerDock";
import { api } from "@/lib/api-client";
import { dispositionTypeOfStatus, callStatusLabel } from "@/lib/call-outcome";
import { fieldLabel, formatValue, timeAgo, type AdminActivityResponse } from "@/lib/admin";
import type { Contact } from "./model";

export type RailTab = "summary" | "activity" | "script" | "notes" | "website";

const TABS: { key: RailTab; label: string; icon: IconComponent; prospectOnly?: boolean }[] = [
  { key: "summary", label: "Call summary", icon: BarChart3 },
  { key: "activity", label: "Record history", icon: Activity },
  { key: "script", label: "Call script", icon: BookOpen },
  { key: "notes", label: "Notes", icon: FileText },
  { key: "website", label: "Website and video", icon: Globe, prospectOnly: true },
];

/** The thin icon column at the far right. Clicking the open tab closes its panel. */
export function RailIcons({ contact, open, onOpen }: { contact: Contact; open: RailTab | null; onOpen: (t: RailTab | null) => void }) {
  return (
    <nav aria-label="Contact panels" className="w-12 shrink-0 border-l border-[var(--ods-border)] bg-[var(--ods-bg-primary)] flex flex-col items-center gap-1 py-2">
      {TABS.filter((t) => !t.prospectOnly || contact.type === "prospect").map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          onClick={() => onOpen(open === key ? null : key)}
          title={label}
          aria-label={label}
          aria-pressed={open === key}
          className={`w-9 h-9 rounded-[8px] inline-flex items-center justify-center ${
            open === key ? "bg-[var(--ods-brand-600)] text-white" : "text-[var(--ods-text-secondary)] hover:bg-[var(--ods-hover)] hover:text-[var(--ods-text-primary)]"
          }`}
        >
          <Icon className="w-4 h-4" />
        </button>
      ))}
    </nav>
  );
}

/** The panel for the open rail tab. */
export function RailPanel({
  tab,
  contact,
  calls,
  onClose,
  onSaveNotes,
}: {
  tab: RailTab;
  contact: Contact;
  calls: any[];
  onClose: () => void;
  onSaveNotes: (notes: string) => Promise<boolean>;
}) {
  const title = TABS.find((t) => t.key === tab)?.label ?? "";
  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="h-12 px-4 shrink-0 flex items-center justify-between gap-2 border-b border-[var(--ods-border)]">
        <span className="text-[15px] font-semibold truncate">{title}</span>
        <button onClick={onClose} title="Close panel" className="w-8 h-8 rounded-[8px] inline-flex items-center justify-center text-[var(--ods-text-tertiary)] hover:text-[var(--ods-text-primary)] hover:bg-[var(--ods-hover)]">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === "summary" && <SummaryPanel calls={calls} />}
        {tab === "activity" && <HistoryPanel contact={contact} />}
        {tab === "script" &&
          (contact.campaignId ? (
            <CallScriptViewer bare campaignId={contact.campaignId} onClose={onClose} />
          ) : (
            <Empty text="This contact is not in a campaign, so there is no call script." />
          ))}
        {tab === "notes" && <NotesPanel key={contact.id} notes={contact.notes ?? ""} onSave={onSaveNotes} />}
        {tab === "website" && contact.type === "prospect" && (
          <div className="p-3">
            <SendWebsiteWidget
              prospect={{ id: contact.id, first_name: contact.firstName, last_name: contact.lastName, phone: contact.phone ?? undefined, website: contact.website ?? undefined, country: contact.country ?? undefined }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="p-6 text-center text-[13px] text-[var(--ods-text-tertiary)]">{text}</p>;
}

function SummaryPanel({ calls }: { calls: any[] }) {
  const stats = useMemo(() => {
    const talk = calls.reduce((n, c) => n + (c.durationSeconds ?? 0), 0);
    const connected = calls.filter((c) => (c.durationSeconds ?? 0) > 0 && c.status !== "NO_ANSWER" && c.status !== "FAILED").length;
    const positive = calls.filter((c) => dispositionTypeOfStatus(c.status) === "positive").length;
    const last = calls[0];
    return { talk, connected, positive, last };
  }, [calls]);
  const tiles: [string, string][] = [
    ["Calls", String(calls.length)],
    ["Connected", String(stats.connected)],
    ["Talk time", formatDuration(stats.talk)],
    ["Positive", String(stats.positive)],
  ];
  return (
    <div className="p-3 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {tiles.map(([label, value]) => (
          <div key={label} className="rounded-[10px] border border-[var(--ods-border)] p-3">
            <div className="text-[12px] text-[var(--ods-text-tertiary)]">{label}</div>
            <div className="text-[20px] font-semibold tabular-nums">{value}</div>
          </div>
        ))}
      </div>
      {stats.last ? (
        <div className="rounded-[10px] border border-[var(--ods-border)] p-3 text-[13px]">
          <div className="text-[12px] text-[var(--ods-text-tertiary)]">Last call</div>
          <div className="font-semibold">{callStatusLabel(stats.last.status)}</div>
          <div className="text-[var(--ods-text-secondary)]">{timeAgo(stats.last.startedAt || stats.last.created_at)}</div>
        </div>
      ) : (
        <Empty text="No calls with this contact yet." />
      )}
    </div>
  );
}

function HistoryPanel({ contact }: { contact: Contact }) {
  const { data, isLoading } = useQuery<AdminActivityResponse>({
    queryKey: ["record-activity", contact.type, contact.id],
    queryFn: () => api.admin.recordActivity(`${contact.type}:${contact.id}`),
    staleTime: 30_000,
  });
  if (isLoading) return <Empty text="Loading history…" />;
  const events = data?.activities ?? [];
  if (!events.length) return <Empty text="Twenty has no recorded changes for this contact." />;
  return (
    <ol className="p-3">
      {events.map((e) => {
        const who = e.actor.name || (e.actor.memberId ? data?.members[e.actor.memberId] : null) || "Dialer";
        const Icon = e.action === "created" ? Plus : Pencil;
        return (
          <li key={e.id} className="relative pl-7 pb-4 last:pb-0">
            <span className="absolute left-[11px] top-6 bottom-0 w-px bg-[var(--ods-border)]" aria-hidden="true" />
            <span className="absolute left-0 top-0 w-6 h-6 rounded-md bg-[var(--ods-bg-tertiary)] flex items-center justify-center">
              <Icon className="w-3 h-3 text-[var(--ods-text-secondary)]" />
            </span>
            <div className="text-[13px] font-semibold capitalize">{e.action}</div>
            <div className="text-[12px] text-[var(--ods-text-tertiary)]">
              {who} · {new Date(e.happensAt).toLocaleString()}
            </div>
            {e.changes.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-[12px] text-[var(--ods-text-secondary)]">
                {e.changes.filter((c) => c.field !== "createdBy" && c.field !== "updatedBy" && c.field !== "searchVector").slice(0, 6).map((c) => (
                  <li key={c.field} className="break-words">
                    <b>{fieldLabel(c.field)}</b>: {formatValue(c.before).slice(0, 60)} <span aria-hidden="true">&rarr;</span> {formatValue(c.after).slice(0, 60)}
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function NotesPanel({ notes, onSave }: { notes: string; onSave: (n: string) => Promise<boolean> }) {
  const [draft, setDraft] = useState(notes);
  const [saved, setSaved] = useState(false);
  useEffect(() => setDraft(notes), [notes]);
  const dirty = draft !== notes;
  return (
    <div className="p-3 space-y-2">
      <p className="text-[12px] text-[var(--ods-text-tertiary)]">The whole notes field as Twenty stores it. Notes added from the composer appear here with their time and author.</p>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={16}
        className="w-full resize-y rounded-[8px] border border-[var(--ods-border-strong)] bg-[var(--ods-bg-primary)] px-3 py-2 text-[14px] outline-none focus:border-[var(--ods-brand-500)]"
      />
      <div className="flex items-center justify-end gap-2">
        {saved && !dirty && (
          <span className="text-[12px] text-emerald-600 inline-flex items-center gap-1">
            <Check className="w-3 h-3" /> Saved
          </span>
        )}
        <button onClick={() => setDraft(notes)} disabled={!dirty} className="h-9 px-4 rounded-[8px] border border-[var(--ods-border-strong)] text-[13px] font-semibold disabled:opacity-40">
          Undo
        </button>
        <button
          onClick={async () => setSaved(await onSave(draft))}
          disabled={!dirty}
          className="h-9 px-3 rounded-[8px] bg-[var(--ods-brand-600)] text-white text-[13px] font-semibold disabled:opacity-50"
        >
          Save notes
        </button>
      </div>
    </div>
  );
}
