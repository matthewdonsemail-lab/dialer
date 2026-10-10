import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/domains/ui/button";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  ChevronDown,
  FileText,
  ListFilter,
  MessageSquare,
  Pencil,
  Phone,
  PhoneIncoming,
  PhoneOff,
  PhoneOutgoing,
  Play,
  Plus,
  Send,
} from "@/domains/ui/icons";
import { Chip } from "@/domains/ui/chip";
import { SelectMenu } from "@/domains/ui/menu";
import { DispositionBadge } from "@/domains/calls/disposition";
import { RatingBadge, WaveformPlayer } from "@/domains/calls/rating";
import { CountryFlag } from "@/domains/country/badge";
import { useDialer } from "@/domains/dialer/provider";
import { formatDuration } from "@/domains/dialer/dock";
import { usePersistedState } from "@/domains/app/persistedState";
import { api } from "@/domains/api/client";
import { countSms } from "@/domains/messaging/smsCount";
import { parseNotes } from "@/domains/contact/notes";
import { countryCode } from "@/domains/country/lookup";
import { dispositionTypeOfStatus } from "@/domains/calls/disposition";
import type { HistoryRow } from "@/domains/activity/historyFormat";
import { HistorySentence, rowIcon } from "@/domains/contact/history";
import { useRecordHistory } from "@/domains/contact/history";
import type { Contact } from "@/domains/contact/model";
import { initials } from "@/domains/contact/model";

export type ComposerMode = "sms" | "note";

type FeedFilter = "all" | "calls" | "notes" | "updates";

type FeedItem =
  | { kind: "call"; at: string; call: any }
  | { kind: "note"; at: string | null; author: string | null; body: string }
  | { kind: "event"; at: string; row: HistoryRow };

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { day: "numeric", month: "short", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export function ContactFeed({
  contact,
  calls,
  composer,
  onComposerChange,
  onAddNote,
  composerFocus,
}: {
  contact: Contact;
  calls: any[];
  composer: ComposerMode;
  onComposerChange: (m: ComposerMode) => void;
  onAddNote: (body: string) => Promise<boolean>;
  /** Bumped to focus the composer (sidebar SMS / Note buttons). */
  composerFocus: number;
}) {
  const { dial } = useDialer();
  const [filter, setFilter] = usePersistedState<FeedFilter>("contact-feed-filter", "all");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { rows: history } = useRecordHistory(contact);

  const items = useMemo<FeedItem[]>(() => {
    const out: FeedItem[] = [];
    for (const call of calls) out.push({ kind: "call", at: call.startedAt || call.created_at, call });
    for (const n of parseNotes(contact.notes)) out.push({ kind: "note", at: n.at, author: n.author, body: n.body });
    // Record changes, the same rows as Record history. Added notes already
    // show as note cards, so their history rows are left out here.
    for (const row of history) if (row.kind !== "note") out.push({ kind: "event", at: row.at, row });
    if (!history.some((r) => r.kind === "created") && contact.createdAt) {
      out.push({
        kind: "event",
        at: contact.createdAt,
        row: { id: "created", at: contact.createdAt, kind: "created", field: null, label: `${contact.type === "lead" ? "Lead" : "Prospect"} created`, before: { kind: "blank" }, after: { kind: "blank" }, who: "Dialer", source: null },
      });
    }
    // Oldest first, like a chat: undated (older free-form) notes lead.
    return out.sort((a, b) => (a.at ? new Date(a.at).getTime() : 0) - (b.at ? new Date(b.at).getTime() : 0));
  }, [calls, contact, history]);

  const shown = items.filter((i) => filter === "all" || (filter === "calls" && i.kind === "call") || (filter === "notes" && i.kind === "note") || (filter === "updates" && i.kind === "event"));

  // Land on the newest item, and follow new items as they arrive.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [shown.length, filter]);

  let lastDay = "";
  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="h-12 px-4 shrink-0 flex items-center justify-between gap-3 bg-[var(--ods-bg-primary)] border-b border-[var(--ods-border)]">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 shrink-0 rounded-md bg-[color-mix(in_srgb,var(--ods-brand-600)_15%,transparent)] text-[var(--ods-brand-600)] flex items-center justify-center text-[12px] font-semibold">
            {initials(contact.name)}
          </div>
          <span className="text-[15px] font-semibold truncate">{contact.name}</span>
          {contact.country && <CountryFlag code={countryCode(contact.country)} />}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <SelectMenu
            value={filter}
            onChange={(v) => setFilter(v as FeedFilter)}
            width={200}
            placement="bottom-end"
            sections={[
              {
                title: "Show",
                options: [
                  { value: "all", label: "Everything", hint: items.length },
                  { value: "calls", label: "Calls", hint: items.filter((i) => i.kind === "call").length },
                  { value: "notes", label: "Notes", hint: items.filter((i) => i.kind === "note").length },
                  { value: "updates", label: "Record updates", hint: items.filter((i) => i.kind === "event").length },
                ],
              },
            ]}
            triggerTitle="Filter the timeline"
            triggerClassName="h-9 px-3 rounded-[8px] border border-[var(--ods-border-strong)] text-[13px] font-semibold inline-flex items-center gap-1.5 hover:bg-[var(--ods-hover)]"
            trigger={
              <>
                <ListFilter className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{filter === "all" ? "All activity" : filter === "calls" ? "Calls" : filter === "notes" ? "Notes" : "Updates"}</span>
                <ChevronDown className="w-3 h-3 opacity-60 hidden sm:inline" />
              </>
            }
          />
          <Button
            variant="call"
            icon={Phone}
            disabled={!contact.phone}
            onClick={() =>
              contact.phone && void dial({ contactType: contact.type, contactId: contact.id, phone: contact.phone, name: contact.name, campaignId: contact.campaignId, country: contact.country })
            }
          >
            Call
          </Button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3 bg-[var(--ods-bg-secondary)]">
        {shown.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center gap-2 text-[var(--ods-text-tertiary)]">
            <CalendarDays className="w-6 h-6" />
            <p className="text-[13px]">{filter === "all" ? "Nothing here yet. Calls, notes and changes show up as they happen." : "Nothing of this kind yet."}</p>
          </div>
        )}
        {shown.map((item, i) => {
          const day = item.at ? dayLabel(item.at) : "Earlier notes";
          const separator = day !== lastDay;
          lastDay = day;
          return (
            <div key={i} className="space-y-3">
              {separator && (
                <div className="flex justify-center">
                  <Chip icon={CalendarDays}>{day}</Chip>
                </div>
              )}
              {item.kind === "call" && <CallItem call={item.call} />}
              {item.kind === "note" && <NoteItem at={item.at} author={item.author} body={item.body} />}
              {item.kind === "event" && <EventItem row={item.row} />}
            </div>
          );
        })}
      </div>

      <Composer contact={contact} mode={composer} onModeChange={onComposerChange} onAddNote={onAddNote} focusSignal={composerFocus} />
    </div>
  );
}

// ---------------------------------------------------------------- items

function CallItem({ call }: { call: any }) {
  const [playing, setPlaying] = useState(false);
  const inbound = call.direction === "INBOUND";
  const type = dispositionTypeOfStatus(call.status);
  const answered = (call.durationSeconds ?? 0) > 0 && call.status !== "NO_ANSWER" && call.status !== "FAILED";
  const Icon = !answered ? PhoneOff : inbound ? PhoneIncoming : PhoneOutgoing;
  const iconTone = !answered || type === "negative" ? "text-red-600" : "text-emerald-600";
  const hasRecording = !!(call.telnyxRecordingId || call.recordingUrl);
  const when = call.startedAt || call.created_at;
  return (
    <div className={`max-w-[560px] ${inbound ? "mr-auto" : "ml-auto"} rounded-[10px] border border-[var(--ods-border)] bg-[var(--ods-bg-primary)] p-3 space-y-2`}>
      <div className="flex items-center gap-2.5">
        <span className={`w-8 h-8 shrink-0 rounded-md bg-[var(--ods-bg-tertiary)] flex items-center justify-center ${iconTone}`}>
          <Icon className="w-3.5 h-3.5" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-semibold truncate">
            {inbound ? "Inbound call" : "Outbound call"}
            <span className="font-normal text-[var(--ods-text-secondary)]"> · {formatDuration(call.durationSeconds ?? 0)}</span>
          </div>
          <div className="text-[12px] text-[var(--ods-text-tertiary)] truncate tabular-nums">
            {call.fromNumber || "?"} <span aria-hidden="true">&rarr;</span> {call.toNumber || "?"}
            {call.createdBy?.name ? ` · ${call.createdBy.name}` : ""} · {when ? time(when) : ""}
          </div>
        </div>
        <DispositionBadge status={call.status} />
      </div>
      {(call.aiSummary || call.summary) && <p className="text-[13px] text-[var(--ods-text-secondary)]">{call.aiSummary ?? call.summary}</p>}
      {call.notes && (
        <p className="text-[13px] whitespace-pre-wrap rounded-[8px] bg-[var(--ods-bg-secondary)] px-3 py-2">
          <span className="font-semibold">Call notes: </span>
          {call.notes}
        </p>
      )}
      {playing && <WaveformPlayer src={call.recordingUrl} callId={call.id} seed={call.id} />}
      <div className="flex flex-wrap items-center gap-2">
        {hasRecording && !playing && (
          <Button size="sm" icon={Play} onClick={() => setPlaying(true)}>
            Play recording
          </Button>
        )}
        {(call.aiScore != null || call.aiSentiment) && <RatingBadge sentiment={call.aiSentiment} score={call.aiScore} />}
        {call.transcriptionStatus === "READY" && <Chip icon={FileText}>Transcript</Chip>}
        <Link to={`/history/${call.id}`} className="ml-auto text-[12px] font-semibold ods-link">
          Open call review
        </Link>
      </div>
    </div>
  );
}

function NoteItem({ at, author, body }: { at: string | null; author: string | null; body: string }) {
  return (
    <div className="max-w-[560px] ml-auto rounded-[10px] border border-amber-500/30 bg-amber-500/10 p-3">
      <div className="flex items-center gap-2 text-[12px] text-[var(--ods-text-tertiary)] mb-1">
        <FileText className="w-3.5 h-3.5 text-amber-600" />
        <span className="font-semibold text-[var(--ods-text-secondary)]">Note</span>
        {author && <span>· {author}</span>}
        {at && <span className="ml-auto">{time(at)}</span>}
      </div>
      <p className="text-[14px] whitespace-pre-wrap break-words">{body}</p>
    </div>
  );
}

/** A record change as a centred pill, the same sentence as Record history. */
function EventItem({ row }: { row: HistoryRow }) {
  const Icon = rowIcon(row);
  return (
    <div className="flex justify-center">
      <div className="max-w-[560px] inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1 px-3 py-1.5 rounded-md border border-[var(--ods-border)] bg-[var(--ods-bg-primary)] text-[13px] leading-6 text-[var(--ods-text-secondary)]">
        <Icon className="w-3 h-3 shrink-0 text-[var(--ods-text-tertiary)]" />
        <span className="min-w-0 text-center">
          <HistorySentence row={row} />
        </span>
        <span className="shrink-0 text-[12px] text-[var(--ods-text-tertiary)]">
          {row.who} · {time(row.at)}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- composer

function Composer({
  contact,
  mode,
  onModeChange,
  onAddNote,
  focusSignal,
}: {
  contact: Contact;
  mode: ComposerMode;
  onModeChange: (m: ComposerMode) => void;
  onAddNote: (body: string) => Promise<boolean>;
  focusSignal: number;
}) {
  const { lines, line, setLine } = useDialer();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const sms = countSms(text);

  useEffect(() => {
    if (focusSignal) ref.current?.focus();
  }, [focusSignal]);

  const submit = async () => {
    if (!text.trim() || busy) return;
    if (mode === "note") {
      setBusy(true);
      if (await onAddNote(text)) setText("");
      setBusy(false);
    }
  };

  const tabs: { key: ComposerMode; label: string; icon: typeof Phone }[] = [
    { key: "sms", label: "SMS", icon: MessageSquare },
    { key: "note", label: "Note", icon: FileText },
  ];

  return (
    <div className="shrink-0 border-t border-[var(--ods-border)] bg-[var(--ods-bg-primary)] p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex p-0.5 rounded-[8px] border border-[var(--ods-border)] bg-[var(--ods-bg-secondary)]">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => onModeChange(key)}
              aria-pressed={mode === key}
              className={`h-8 px-3 rounded-md text-[13px] font-semibold inline-flex items-center gap-1.5 ${
                mode === key ? "bg-[var(--ods-brand-600)] text-white" : "text-[var(--ods-text-secondary)] hover:text-[var(--ods-text-primary)]"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
        {mode === "sms" && (
          <div className="flex items-center gap-2 text-[12px] text-[var(--ods-text-tertiary)] min-w-0">
            <span>From</span>
            <SelectMenu
              value={line?.id ?? null}
              onChange={setLine}
              width={240}
              placement="top-start"
              sections={[{ title: "Your numbers", options: lines.map((l) => ({ value: l.id, label: l.phoneNumber, icon: <CountryFlag code={countryCode(l.countryCode)} /> })) }]}
              triggerClassName="h-8 px-2 rounded-[8px] border border-[var(--ods-border)] text-[13px] font-semibold text-[var(--ods-text-primary)] inline-flex items-center gap-1.5 tabular-nums"
              trigger={
                <>
                  {line && <CountryFlag code={countryCode(line.countryCode)} />}
                  {line?.phoneNumber ?? "No number"}
                  <ChevronDown className="w-3 h-3 opacity-60" />
                </>
              }
            />
            <span>To</span>
            <span className="font-semibold text-[var(--ods-text-primary)] tabular-nums truncate">{contact.phone ?? "No number"}</span>
          </div>
        )}
      </div>
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
        }}
        rows={3}
        placeholder={mode === "sms" ? `Text ${contact.name}…` : "Add a note to this contact…"}
        className={`w-full resize-none rounded-[8px] border px-3 py-2 text-[14px] outline-none focus:border-[var(--ods-brand-500)] ${
          mode === "note" ? "border-amber-500/40 bg-amber-500/5" : "border-[var(--ods-border)] bg-[var(--ods-bg-primary)]"
        }`}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] text-[var(--ods-text-tertiary)] tabular-nums">
          {mode === "sms" ? `Chars: ${sms.units} · Segments: ${sms.segments}${sms.encoding === "UCS-2" ? " · Unicode" : ""}` : "Ctrl+Enter to save"}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" disabled={!text} onClick={() => setText("")}>
            Clear
          </Button>
          {mode === "note" ? (
            <Button variant="primary" icon={Plus} disabled={!text.trim()} busy={busy} busyLabel="Saving…" onClick={() => void submit()}>
              Add note
            </Button>
          ) : (
            <Button variant="primary" icon={Send} disabled title="SMS sending is wired up in the messaging phase (Phase 2)">
              Send
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
