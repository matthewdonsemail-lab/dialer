import { useEffect, useMemo, useState } from "react";
import { Button } from "@/primitives";
import { useQuery } from "@tanstack/react-query";
import { Activity, BarChart3, BookOpen, Check, FileText, Globe, Pencil, Plus, X, type IconComponent } from "@/components/ui/icons";
import { CallScriptViewer } from "@/components/scripts/CallScriptViewer";
import { WebsitePanel } from "@/domains/website";
import { formatDuration } from "@/components/dialer/DialerDock";
import { api } from "@/lib/api-client";
import { dispositionTypeOfStatus, callStatusLabel } from "@/lib/call-outcome";
import { timeAgo } from "@/lib/admin";
import type { Contact } from "../types/contact";
import { RecordHistory } from "./record-history-panel";

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
        {tab === "activity" && <RecordHistory contact={contact} />}
        {tab === "script" &&
          (contact.campaignId ? (
            <CallScriptViewer bare campaignId={contact.campaignId} onClose={onClose} />
          ) : (
            <Empty text="This contact is not in a campaign, so there is no call script." />
          ))}
        {tab === "notes" && <NotesPanel key={contact.id} notes={contact.notes ?? ""} onSave={onSaveNotes} />}
        {tab === "website" && contact.type === "prospect" && (
          <WebsitePanel prospectId={contact.id} prospectPhone={contact.phone} prospectCountry={contact.country} />
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
            <div className="text-xl font-bold tabular-nums text-[var(--ods-text-primary)]">{value}</div>
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
        <Button variant="ghost" disabled={!dirty} onClick={() => setDraft(notes)}>
          Undo
        </Button>
        <Button variant="primary" disabled={!dirty} onClick={async () => setSaved(await onSave(draft))}>
          Save notes
        </Button>
      </div>
    </div>
  );
}
