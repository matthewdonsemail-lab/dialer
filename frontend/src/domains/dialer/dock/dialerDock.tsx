import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/domains/ui/button";
import { buttonClass } from "@/domains/ui/button";
import { inputClass } from "@/domains/ui/input";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Backspace,
  BookOpen,
  Check,
  ChevronDown,
  Clock,
  ExternalLink,
  FileText,
  Globe,
  Keyboard,
  ListFilter,
  Mic,
  MicOff,
  Music,
  Pause,
  Phone,
  PhoneIncoming,
  PhoneOff,
  PhoneOutgoing,
  Pin,
  Play,
  Save,
  Search,
  Settings,
  SkipForward,
  Square,
  Trash2,
  User,
  Users,
  X,
  type IconComponent,
} from "@/domains/ui/icons";
import { Chip } from "@/domains/ui/chip";
import { SelectMenu } from "@/domains/ui/menu";
import { TabBar } from "@/domains/ui/tabBar";
import { MusicTab, NowPlaying } from "@/domains/music/dock";
import { useExperimental } from "@/domains/app/experimental";
import { CountryFlag } from "@/domains/country/badge";
import { DispositionBadge, DispositionIcon } from "@/domains/calls/disposition";
import { AudioSourceSettings } from "@/domains/dialer/audio";
import { DialingModeSettings, VoicemailSettings } from "@/domains/dialer/dialingSettings";
import { MODE_INFO } from "@/domains/dialer/dialing";
import { Notice } from "@/domains/ui/notice";
import { CallScriptViewer } from "@/domains/scripts/viewer";
import { usePowerDialer, contactDisplayName } from "@/domains/campaigns/powerDialer";
import { usePersistedState } from "@/domains/app/persistedState";
import { useCalls } from "@/domains/calls/data";
import { contactsApi, contactName, memberOptions, resolveMember, useContactFacets, useProspectLookup, type ContactRow } from "@/domains/contact/list";
import { lineCountry, lineRegion, pickCallLine } from "@/domains/dialer/route";
import { DockContactPanel } from "@/domains/dialer/contactPanel";
import { regionOfCountry } from "@dialer/shared";
import { countryCode, countryName } from "@/domains/country/lookup";
import { DISPOSITIONS, dispositionFor, outcomeLabel } from "@/domains/calls/disposition";
import { isLive, useDialer, type CallState, type LegStatus } from "@/domains/dialer/provider";
import { useAuth } from "@/domains/auth/provider";
import { useToast } from "@/domains/ui/toast";
import { describeError } from "@/domains/feedback/describeError";
import { useAccountFilters } from "./useAccountFilters";

// Buttons and inputs come from the design primitives (docs/design-system.md).
const BTN_PRIMARY = buttonClass({ variant: "primary" });
const BTN_SECONDARY = buttonClass({ variant: "secondary" });
const BTN_ICON = buttonClass({ variant: "ghost", size: "sm", iconOnly: true });
const INPUT = inputClass;

export function formatDuration(s: number): string {
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

const STATE_LABEL: Record<CallState, string> = {
  idle: "Ready",
  connecting: "Calling",
  ringing: "Ringing",
  active: "Connected",
  on_hold: "On hold",
  ended: "Call ended",
};

const STATE_DOT: Record<CallState, string> = {
  idle: "bg-gray-400",
  connecting: "bg-sky-500",
  ringing: "bg-sky-500",
  active: "bg-emerald-500",
  on_hold: "bg-amber-500",
  ended: "bg-red-500",
};

/** Top-bar phone button. The green dot means the dialer is registered for calls. */
export function DialerTopButton() {
  const { toggle, isOpen, registered, phoneAudio, state, duration } = useDialer();
  const ready = registered || phoneAudio;
  const live = isLive(state);
  return (
    <button
      data-dialer-toggle
      onClick={toggle}
      title={ready ? "Dialer (ready for calls)" : "Dialer"}
      aria-pressed={isOpen}
      className={`relative h-7 inline-flex items-center gap-1.5 px-1.5 rounded-md transition ${
        isOpen ? "bg-[var(--ods-hover)]" : "hover:bg-[var(--ods-hover)]"
      } text-emerald-600`}
    >
      <Phone className="w-4 h-4" />
      {live && <span className="text-[12px] font-semibold tabular-nums">{formatDuration(duration)}</span>}
      <span
        className={`absolute top-0.5 right-0.5 w-2 h-2 rounded-md border border-[var(--ods-bg-primary)] ${ready ? "bg-emerald-500" : "bg-gray-400"}`}
        aria-hidden="true"
      />
    </button>
  );
}

/**
 * The floating dialer card. It lives in Layout, so a call carries on across
 * pages; closing it only hides it. Views follow the call: idle (tabs), in
 * call, call summary, with incoming calls and settings on top.
 */
/** What floats beside the dock: the call script, or a contact's details. */
type SidePanel = { kind: "script" } | { kind: "contact"; contactType: "prospect" | "lead"; contactId: string } | null;
const SideContext = createContext<{ side: SidePanel; setSide: (s: SidePanel) => void }>({ side: null, setSide: () => {} });

/** A person is called as their company (where calls and history are kept); without one they cannot be dialled. */
const rowRecord = (r: ContactRow) =>
  r.type === "person" ? (r.prospectId ? { type: "prospect" as const, id: r.prospectId } : null) : { type: r.type, id: r.id };

const rowTarget = (r: ContactRow) => {
  const record = rowRecord(r);
  return {
    contactType: record?.type ?? null,
    contactId: record?.id ?? null,
    phone: record ? ((r.phone as string | null) ?? "") : "",
    name: contactName(r) ?? "Unknown",
    campaignId: (r.campaign_id as string | null) ?? null,
    country: (r.country as string | undefined) ?? null,
  };
};

/**
 * Auto-queue next call: with it on, picking a disposition on a call dialled
 * from the Contacts list saves it and dials the next contact in that list
 * straight away. Off, the disposition waits for Done and saving returns to
 * the list as before.
 */
const AutoQueueContext = createContext<{
  /** Dials rows[index]; with auto-queue on, the next contact follows once the call is saved. */
  dialFromList: (rows: ContactRow[], index: number) => void;
  /** The switch itself, owned by the dock so a save always reads the latest value. */
  on: boolean;
  setOn: (on: boolean) => void;
  /** Lines that ring at once when dialling from the list (Calling from menu). */
  lineCount: number;
  setLineCount: (n: number) => void;
}>({ dialFromList: () => {}, on: false, setOn: () => {}, lineCount: 1, setLineCount: () => {} });

/** Opens (or, when it is already showing, closes) a contact beside the dock. */
function useContactSide() {
  const { side, setSide } = useContext(SideContext);
  return {
    isShown: (id: string | null | undefined) => side?.kind === "contact" && side.contactId === id,
    toggle: (contactType: "prospect" | "lead", contactId: string) =>
      setSide(side?.kind === "contact" && side.contactId === contactId ? null : { kind: "contact", contactType, contactId }),
  };
}

export function DialerDock() {
  const dialer = useDialer();
  const { isOpen, close, open, pinned, setPinned, state, duration } = dialer;
  const ref = useRef<HTMLDivElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [side, setSide] = useState<SidePanel>(null);
  const scriptOpen = side?.kind === "script";

  // ---- auto-queue next call ----
  const [autoQueue, setAutoQueue] = usePersistedState("dialer-auto-queue", false);
  const autoQueueRef = useRef(autoQueue);
  autoQueueRef.current = autoQueue;
  const { info: toastInfo } = useToast();
  const [linesWanted, setLineCount] = usePersistedState("dialer-parallel-lines", 1);
  const lineCount = Math.max(1, Math.min(linesWanted, dialer.maxLines));
  const lineCountRef = useRef(lineCount);
  lineCountRef.current = lineCount;
  const dialRef = useRef(dialer.dialMany);
  dialRef.current = dialer.dialMany;
  const dialFromList = useCallback((rows: ContactRow[], index: number) => {
    if (!rows[index] || !rowTarget(rows[index]).phone) return;
    // How far down the list this call (or batch of lines) went; the next one starts after it.
    let consumed = 1;
    consumed = dialRef.current(rows.slice(index).map(rowTarget), lineCountRef.current, {
      // Read at save time, so the switch can be flipped during the call.
      onSaved: () => {
        if (!autoQueueRef.current) return;
        const next = rows.findIndex((x, i) => i >= index + Math.max(1, consumed) && !!rowTarget(x).phone);
        if (next < 0) {
          toastInfo("End of the list", "No more contacts with a number in this list.");
          return;
        }
        dialFromList(rows, next);
      },
    });
  }, [toastInfo]);
  const autoQueueValue = useMemo(
    () => ({
      dialFromList,
      on: autoQueue,
      setOn: setAutoQueue,
      lineCount,
      setLineCount,
    }),
    [dialFromList, autoQueue, setAutoQueue, lineCount, setLineCount],
  );

  // Unpinned: a click outside closes it (menus portal out, so skip those).
  useEffect(() => {
    if (!isOpen || pinned) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (ref.current?.contains(t) || t.closest("[data-dialer-toggle]") || t.closest("[data-floating-ui-portal]")) return;
      close();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [isOpen, pinned, close]);

  // The script belongs to the live call; a contact stays up through the summary.
  useEffect(() => {
    if (!isLive(state)) setSide((s) => (s?.kind === "script" ? null : s));
  }, [state]);

  // An open contact panel follows the call: dialling the next person shows
  // them, not the one before (the panel remounts and shows its skeleton).
  const targetType = dialer.target?.contactType ?? null;
  const targetId = dialer.target?.contactId ?? null;
  useEffect(() => {
    if (!targetType || !targetId) return;
    setSide((s) => (s?.kind === "contact" && s.contactId !== targetId ? { kind: "contact", contactType: targetType, contactId: targetId } : s));
  }, [targetType, targetId]);

  if (!isOpen) {
    if (!isLive(state)) return null;
    // Minimised mid-call: a timer pill that reopens the dock.
    return (
      <button
        onClick={open}
        className="fixed top-12 right-4 z-[55] h-8 px-3 rounded-[8px] bg-emerald-600 text-white text-[13px] font-semibold tabular-nums inline-flex items-center gap-2 shadow-[0_8px_24px_rgba(0,0,0,0.2)]"
      >
        <Phone className="w-3.5 h-3.5" />
        {formatDuration(duration)}
      </button>
    );
  }

  let body: ReactNode;
  if (settingsOpen) body = <SettingsSheet onClose={() => setSettingsOpen(false)} />;
  else if (isLive(state)) body = <InCallView scriptOpen={scriptOpen} onToggleScript={() => setSide(scriptOpen ? null : { kind: "script" })} />;
  else if (state === "ended") body = <SummaryView />;
  else body = <IdleView />;

  return (
    <AutoQueueContext.Provider value={autoQueueValue}>
    <SideContext.Provider value={{ side, setSide }}>
    <div
      ref={ref}
      role="dialog"
      aria-label="Dialer"
      className="fixed top-12 right-4 z-[55] w-[360px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-64px)] flex flex-col rounded-[12px] border border-[var(--ods-border)] bg-[var(--ods-bg-primary)] text-[var(--ods-text-primary)] shadow-[0_16px_40px_rgba(0,0,0,0.18)]"
    >
      {scriptOpen && dialer.target && (
        <div className="hidden md:block absolute right-full top-0 mr-2 w-[360px]">
          <CallScriptViewer docked campaignId={dialer.target.campaignId ?? null} onClose={() => setSide(null)} />
        </div>
      )}
      {side?.kind === "contact" && (
        <div className="hidden md:block absolute right-full top-0 mr-2 w-[360px]">
          <DockContactPanel key={side.contactId} contactType={side.contactType} contactId={side.contactId} onClose={() => setSide(null)} />
        </div>
      )}
      <DockHeader
        pinned={pinned}
        onPin={() => setPinned(!pinned)}
        settingsOpen={settingsOpen}
        onSettings={() => setSettingsOpen((o) => !o)}
        onClose={close}
      />
      {dialer.incoming && <IncomingBanner />}
      <div className="flex-1 min-h-0 flex flex-col">{body}</div>
      {/* The idle view places its own player above the tab bar; on a call it sits at the bottom. */}
      {!settingsOpen && state !== "idle" && <NowPlaying compact />}
    </div>
    </SideContext.Provider>
    </AutoQueueContext.Provider>
  );
}

function DockHeader({
  pinned,
  onPin,
  settingsOpen,
  onSettings,
  onClose,
}: {
  pinned: boolean;
  onPin: () => void;
  settingsOpen: boolean;
  onSettings: () => void;
  onClose: () => void;
}) {
  const { lines, line, setLine, state, maxLines } = useDialer();
  const { lineCount, setLineCount } = useContext(AutoQueueContext);
  const locked = state !== "idle";
  const LINES = "lines:";
  return (
    <div className="h-12 shrink-0 px-3 flex items-center gap-2 border-b border-[var(--ods-border)]">
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-medium text-[var(--ods-text-tertiary)] leading-none mb-0.5">Calling from</div>
        <SelectMenu
          value={line?.id ?? null}
          onChange={(v) => (v.startsWith(LINES) ? setLineCount(Number(v.slice(LINES.length))) : setLine(v))}
          disabled={locked || lines.length === 0}
          width={260}
          sections={[
            {
              title: "Your numbers",
              options: lines.map((l) => ({
                value: l.id,
                label: l.phoneNumber,
                icon: <CountryFlag code={countryCode(l.countryCode)} />,
                hint: l.callState !== "IDLE" ? "in use" : undefined,
              })),
            },
            {
              title: "Lines at once",
              options: Array.from({ length: maxLines }, (_, i) => i + 1).map((n) => ({
                value: `${LINES}${n}`,
                label: n === 1 ? "1 line" : `${n} lines`,
                description:
                  n === 1
                    ? "One call at a time from the number above."
                    : `Rings ${n} contacts from the Contacts list at once, each from its own number. The first to answer is put through; the others hang up.`,
                icon: n === lineCount ? <Check className="w-3.5 h-3.5 text-[var(--ods-brand-600)]" /> : undefined,
              })),
            },
          ]}
          triggerTitle={locked ? "Change the number between calls" : "Choose the number you call from"}
          triggerClassName="max-w-full inline-flex items-center gap-1.5 text-[14px] font-semibold tabular-nums disabled:opacity-70"
          trigger={
            <>
              {line && <CountryFlag code={countryCode(line.countryCode)} />}
              <span className="truncate">{line?.phoneNumber ?? "No free number"}</span>
              {lineCount > 1 && <span className="shrink-0 text-[12px] font-medium text-[var(--ods-brand-600)]">· {lineCount} lines</span>}
              {!locked && lines.length > 0 && <ChevronDown className="w-3 h-3 opacity-60" />}
            </>
          }
        />
      </div>
      <Button
        variant="ghost"
        size="sm"
        icon={Pin}
        pressed={pinned}
        onClick={onPin}
        aria-label={pinned ? "Unpin the dialer" : "Pin the dialer open"}
        title={pinned ? "Pinned: stays open. Click to unpin (then it closes on an outside click)." : "Pin open"}
      />
      <Button variant="ghost" size="sm" icon={Settings} pressed={settingsOpen} onClick={onSettings} aria-label="Dialer settings" title="Dialer settings" />
      <button onClick={onClose} title="Minimise (the call keeps going)" className={BTN_ICON}>
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function IncomingBanner() {
  const { incoming, accept, decline } = useDialer();
  if (!incoming) return null;
  return (
    <div className="m-3 mb-0 p-3 rounded-[10px] border border-[var(--ods-border)] bg-[var(--ods-bg-secondary)] flex items-center gap-3" role="alert">
      <div className="w-9 h-9 rounded-md bg-emerald-500/15 text-emerald-600 flex items-center justify-center animate-pulse">
        <PhoneIncoming className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] text-[var(--ods-text-tertiary)]">Incoming call</div>
        <div className="text-[14px] font-semibold truncate">{incoming.name}</div>
        {incoming.name !== incoming.number && <div className="text-[12px] tabular-nums text-[var(--ods-text-secondary)]">{incoming.number}</div>}
      </div>
      <button onClick={decline} title="Decline" className="w-9 h-9 rounded-md bg-red-600 hover:bg-red-700 text-white flex items-center justify-center">
        <PhoneOff className="w-4 h-4" />
      </button>
      <button onClick={() => void accept()} title="Accept" className="w-9 h-9 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center">
        <Phone className="w-4 h-4" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- idle

type IdleTab = "recents" | "contacts" | "keypad" | "music" | "queue";

function IdleView() {
  const { cooldownNotice, dialAnyway, discardSummary, target } = useDialer();
  const { queue } = usePowerDialer();
  const [tab, setTab] = usePersistedState<IdleTab>("dialer-tab", "recents");
  // The music player is experimental (Settings > Experimental).
  const [music] = useExperimental("musicPlayer");
  const shown = (tab === "queue" && !queue) || (tab === "music" && !music) ? "recents" : tab;
  const tabs = [
    { key: "recents" as const, label: "Recents", icon: Clock },
    { key: "contacts" as const, label: "Contacts", icon: Users },
    { key: "keypad" as const, label: "Keypad", icon: Keyboard },
    ...(music ? [{ key: "music" as const, label: "Music", icon: Music }] : []),
    ...(queue ? [{ key: "queue" as const, label: "Queue", icon: SkipForward, badge: `${queue.position}/${queue.total}` }] : []),
  ];
  return (
    <>
      {cooldownNotice && target && (
        <div className="m-3 mb-0 p-3 rounded-[10px] border border-amber-500/30 bg-amber-500/10 text-[13px]">
          <div className="font-semibold">{target.name}</div>
          <p className="text-[var(--ods-text-secondary)] mt-0.5">{cooldownNotice}</p>
          <div className="mt-2 flex gap-2">
            <button onClick={dialAnyway} className={BTN_PRIMARY}>
              <Phone className="w-3.5 h-3.5" /> Dial anyway
            </button>
            <button onClick={discardSummary} className={BTN_SECONDARY}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {shown === "recents" && <RecentsTab />}
        {shown === "contacts" && <ContactsTab />}
        {shown === "keypad" && <KeypadTab />}
        {shown === "music" && <MusicTab />}
        {shown === "queue" && <QueueTab />}
      </div>
      {shown !== "music" && <NowPlaying compact />}
      <div className="p-2 border-t border-[var(--ods-border)] shrink-0">
        <TabBar tabs={tabs} value={shown} onChange={setTab} />
      </div>
    </>
  );
}

/** The Auto-queue next call switch, in the call summary and the dialer settings. */
function AutoQueueSwitch() {
  const { on, setOn } = useContext(AutoQueueContext);
  return (
    <div className="flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-[var(--ods-text-primary)]">Auto-queue next call</div>
        <p className="text-[12px] text-[var(--ods-text-tertiary)]">
          Picking a disposition saves the call and dials the next contact in the Contacts list straight away.
        </p>
      </div>
      <button
        role="switch"
        aria-checked={on}
        aria-label="Auto-queue next call"
        onClick={() => setOn(!on)}
        className={`relative mt-1 h-5 w-9 shrink-0 rounded-md transition-colors ${on ? "bg-[var(--ods-brand-600)]" : "bg-[var(--ods-border-strong)]"}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-md bg-white shadow transition-[left] ${on ? "left-[18px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}

function ListRow({
  icon: Icon,
  iconClass,
  title,
  meta,
  trailing,
  onClick,
}: {
  icon: IconComponent;
  iconClass: string;
  title: ReactNode;
  meta: ReactNode;
  trailing?: ReactNode;
  onClick: () => void;
}) {
  return (
    <div className="group flex items-center gap-2.5 px-3 py-2 hover:bg-[var(--ods-hover)]">
      <button onClick={onClick} className="flex-1 min-w-0 flex items-center gap-2.5 text-left" title="Call">
        <span className={`w-8 h-8 shrink-0 rounded-md bg-[var(--ods-bg-tertiary)] flex items-center justify-center ${iconClass}`}>
          <Icon className="w-3.5 h-3.5" />
        </span>
        <span className="min-w-0">
          <span className="block text-[14px] font-medium truncate">{title}</span>
          <span className="block text-[12px] text-[var(--ods-text-tertiary)] truncate tabular-nums">{meta}</span>
        </span>
      </button>
      {trailing}
    </div>
  );
}

function RecentsTab() {
  const { dial } = useDialer();
  const navigate = useNavigate();
  const { data: calls, isLoading } = useCalls();
  const recent = useMemo(() => (calls ?? []).slice(0, 30), [calls]);
  const { data: names } = useProspectLookup(recent.map((c: any) => c.agencyProspectId));
  if (isLoading) return <ListSkeleton />;
  if (!recent.length) return <Empty text="No calls yet. Calls you make show up here." />;
  return (
    <div className="py-1">
      {recent.map((c: any) => {
        const inbound = c.direction === "INBOUND";
        const number = inbound ? c.fromNumber : c.toNumber;
        const contact = c.agencyProspectId ? names?.get(c.agencyProspectId) : undefined;
        const name = contactName(contact) ?? number ?? "Unknown";
        const contactType = c.agencyProspectId ? "prospect" : c.agencyLeadId ? "lead" : null;
        const contactId = c.agencyProspectId ?? c.agencyLeadId ?? null;
        const when = c.startedAt || c.created_at;
        return (
          <ListRow
            key={c.id}
            icon={inbound ? PhoneIncoming : PhoneOutgoing}
            iconClass={inbound ? "text-sky-600" : "text-emerald-600"}
            title={name}
            meta={`${name !== number ? `${number} · ` : ""}${when ? new Date(when).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""}`}
            onClick={() => number && void dial({ contactType, contactId, phone: number, name, campaignId: contact?.campaign_id as string | undefined })}
            trailing={
              <span className="flex items-center gap-1 shrink-0">
                <DispositionBadge status={c.status} />
                {contactId && (
                  <button
                    onClick={() => navigate(contactType === "lead" ? `/leads/${contactId}` : `/contacts/${contactId}`)}
                    title="Open contact"
                    className={`${BTN_ICON} opacity-0 group-hover:opacity-100 focus:opacity-100`}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                )}
              </span>
            }
          />
        );
      })}
    </div>
  );
}

/** Dock contact filters, kept per browser like the Contacts table's. */
interface DockFilters {
  /** "all", "line" (local to the calling line: same numbering region) or an ISO country code. */
  country: string;
  /** "all" or an app status ("new", "callback"...). */
  status: string;
  /** "all", "__never" or a call outcome. */
  lastCall: string;
  /** "all", "prospect" or "lead". */
  type: string;
  /** "all" or a raw value from Twenty (industry is the niche). */
  industry: string;
  state: string;
  city: string;
  /** "all", "__blank" (no campaign) or an agencyCampaign id. */
  campaign: string;
  /** "all", "__me", "__blank" (unassigned) or a workspace member id. */
  assignedTo: string;
  /** "all", "__blank" or a Twenty option value (HIRING_SIGNAL, BOTH...). */
  leadSource: string;
  offer: string;
  [key: string]: string;
}
const DOCK_FILTERS: DockFilters = {
  country: "all",
  status: "all",
  lastCall: "all",
  type: "all",
  industry: "all",
  state: "all",
  city: "all",
  campaign: "all",
  assignedTo: "all",
  leadSource: "all",
  offer: "all",
};
/** Twenty option value -> label for the SELECT filters (HIRING_SIGNAL -> "Hiring signal"). */
const optionLabel = (raw: string) => raw.charAt(0) + raw.slice(1).toLowerCase().replace(/_/g, " ");
const DOCK_STATUSES: Array<[app: string, twenty: string, label: string]> = [
  ["new", "NEW", "New"],
  ["contacted", "CONTACTED", "Contacted"],
  ["interested", "INTERESTED", "Interested"],
  ["callback", "CALLBACK", "Callback"],
  ["not_interested", "NOT_INTERESTED", "Not interested"],
  ["converted", "CONVERTED", "Converted"],
  ["do_not_contact", "DO_NOT_CONTACT", "Do not contact"],
];

interface DockFilterOption {
  value: string;
  label: string;
  hint?: number;
  icon?: ReactNode;
}

/** One compact filter menu in the dock's Contacts tab. */
function DockFilter({ label, value, options, onChange }: { label: string; value: string; options: DockFilterOption[]; onChange: (v: string) => void }) {
  const current = options.find((o) => o.value === value);
  const active = value !== "all";
  return (
    <SelectMenu
      value={value}
      onChange={onChange}
      width={260}
      searchable={options.length > 8}
      sections={[{ title: label, options: [{ value: "all", label: "All" }, ...options] }]}
      triggerTitle={`Filter by ${label.toLowerCase()}`}
      triggerClassName={`h-7 min-w-0 max-w-[140px] px-2 inline-flex items-center gap-1 rounded-md border text-[12px] font-medium ${
        active
          ? "border-[color-mix(in_srgb,var(--ods-brand-600)_40%,transparent)] bg-[color-mix(in_srgb,var(--ods-brand-600)_10%,transparent)] text-[var(--ods-brand-700)] dark:text-[var(--ods-brand-300)]"
          : "border-[var(--ods-border)] text-[var(--ods-text-secondary)] hover:bg-[var(--ods-hover)]"
      }`}
      trigger={
        <>
          {active && current?.icon}
          <span className="truncate">{active ? (current?.label ?? label) : label}</span>
          <ChevronDown className="w-3 h-3 opacity-60 shrink-0" />
        </>
      }
    />
  );
}

/**
 * The dock's saved filter sets: pick one to apply it, name and save the
 * filters on screen, or delete one. Saved to the member's account.
 */
function SavedFiltersMenu({ account, filtered }: { account: ReturnType<typeof useAccountFilters<DockFilters>>; filtered: boolean }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const DELETE = "delete:";
  const options = account.views.map((v) => ({
    value: v.id,
    label: v.name,
    hint: `${Object.values(v.filters).filter((x) => x !== "all").length} filters`,
  }));
  return (
    <SelectMenu
      value={null}
      width={280}
      placement="bottom-end"
      onChange={(value) => {
        if (value.startsWith(DELETE)) {
          void account.remove(value.slice(DELETE.length)).catch(() => setError("Could not delete that filter set."));
          return;
        }
        const view = account.views.find((v) => v.id === value);
        if (view) account.apply(view);
      }}
      sections={[
        {
          title: "Saved filters",
          options: options.length ? options : [{ value: "none", label: "None saved yet", disabled: true, description: "Set some filters, name them above and save." }],
        },
        ...(options.length
          ? [{ title: "Delete", options: account.views.map((v) => ({ value: `${DELETE}${v.id}`, label: v.name, icon: <Trash2 className="w-3.5 h-3.5 text-red-600" /> })) }]
          : []),
      ]}
      header={(close) => (
        <form
          className="p-2 border-b border-[var(--ods-border)] space-y-1"
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = name.trim();
            if (!trimmed) return;
            setError(null);
            account
              .saveAs(trimmed)
              .then(() => {
                setName("");
                close();
              })
              .catch(() => setError("Not saved. Try again in a moment."));
          }}
        >
          <div className="flex items-center gap-1.5">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={filtered ? "Name these filters" : "Set filters, then name them"}
              aria-label="Name for the saved filters"
              className={`${INPUT} h-7 text-[12px]`}
            />
            <button type="submit" disabled={!name.trim() || account.saving} className={`${BTN_ICON} shrink-0`} title="Save these filters to your account">
              <Save className="w-3.5 h-3.5" />
            </button>
          </div>
          {error && (
            <div role="alert" className="text-[12px] text-red-600">
              {error}
            </div>
          )}
        </form>
      )}
      triggerTitle="Saved filters"
      triggerClassName="h-7 px-2 ml-auto inline-flex items-center gap-1 rounded-md border border-[var(--ods-border)] text-[12px] font-medium text-[var(--ods-text-secondary)] hover:bg-[var(--ods-hover)]"
      trigger={
        <>
          <Save className="w-3 h-3" />
          Saved
          <ChevronDown className="w-3 h-3 opacity-60 shrink-0" />
        </>
      }
    />
  );
}

function ContactsTab() {
  const { lines, line } = useDialer();
  const { dialFromList } = useContext(AutoQueueContext);
  const navigate = useNavigate();
  const contactSide = useContactSide();
  const [more, setMore] = usePersistedState("dialer-contact-more-filters", false);
  // Kept like the filters: the tab remounts after every call.
  const [q, setQ] = usePersistedState("dialer-contact-q", "");
  const [debounced, setDebounced] = useState(() => q.trim());
  const [saved, setFilters] = usePersistedState<DockFilters>("dialer-contact-filters", DOCK_FILTERS);
  const f = { ...DOCK_FILTERS, ...saved };
  const set = (patch: Partial<DockFilters>) => setFilters({ ...f, ...patch } as DockFilters);
  // Also kept on the member's account, so the filters follow them to any browser.
  const account = useAccountFilters("dock", f, setFilters, DOCK_FILTERS);
  const { user } = useAuth();
  const me = user?.memberId ?? null;
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const { data: facets } = useContactFacets();

  // Countries grouped by ISO code ("CA" and "Canada" are one option).
  const countries = useMemo(() => {
    const groups = new Map<string, { raws: string[]; count: number }>();
    for (const [raw, n] of Object.entries(facets?.country ?? {})) {
      const code = countryCode(raw);
      if (!code) continue;
      const g = groups.get(code) ?? { raws: [], count: 0 };
      g.raws.push(raw);
      g.count += n;
      groups.set(code, g);
    }
    return groups;
  }, [facets]);
  // "Local to" the line: its own country (a US number is not local to Canada,
  // though both dial +1); only a line with no country falls back to its region.
  const fromCountry = lineCountry(line);
  const fromRegion = lineRegion(line);
  const sameCountry = [...countries.entries()].filter(([code]) => (fromCountry ? code === fromCountry : fromRegion !== null && regionOfCountry(code) === fromRegion));
  const lineRaws = sameCountry.flatMap(([, g]) => g.raws);
  const countryOptions: DockFilterOption[] = [
    ...((fromCountry || fromRegion) && line
      ? [{ value: "line", label: `Local to ${line.phoneNumber}`, icon: <CountryFlag code={countryCode(line.countryCode)} />, hint: sameCountry.reduce((n, [, g]) => n + g.count, 0) }]
      : []),
    ...[...countries.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .map(([code, g]) => ({ value: code, label: countryName(code), icon: <CountryFlag code={code} />, hint: g.count })),
  ];
  const statusOptions: DockFilterOption[] = DOCK_STATUSES.map(([app, twenty, label]) => ({
    value: app,
    label,
    hint: (facets?.status?.[twenty] ?? 0) + (app === "new" ? (facets?.status?.["__blank"] ?? 0) : 0),
  }));
  const lastCallOptions: DockFilterOption[] = [
    ...Object.entries(facets?.lastCall ?? {})
      .filter(([raw]) => raw !== "__never")
      .sort((a, b) => b[1] - a[1])
      .map(([raw, n]) => ({ value: raw, label: outcomeLabel(raw), icon: <DispositionIcon status={raw} />, hint: n })),
    ...(facets?.lastCall ? [{ value: "__never", label: "Never called", hint: facets.lastCall.__never ?? 0 }] : []),
  ];

  const valueOptions = (counts: Record<string, number> | undefined): DockFilterOption[] =>
    Object.entries(counts ?? {})
      .filter(([raw]) => raw !== "__blank")
      .sort((a, b) => b[1] - a[1])
      .map(([raw, n]) => ({ value: raw, label: raw, hint: n }));
  const typeOptions: DockFilterOption[] = [
    { value: "prospect", label: "Prospects", hint: facets?.type?.prospect },
    { value: "lead", label: "Leads", hint: facets?.type?.lead },
    // Decision makers (agencyPeople): dialled on their own line, logged on their company.
    { value: "person", label: "People", hint: facets?.type?.person },
  ];
  // Id- and option-valued filters, with "none" for records that have no value.
  const namedOptions = (counts: Record<string, number> | undefined, label: (raw: string) => string, none: string): DockFilterOption[] => [
    ...Object.entries(counts ?? {})
      .filter(([raw]) => raw !== "__blank")
      .sort((a, b) => b[1] - a[1])
      .map(([raw, n]) => ({ value: raw, label: label(raw), hint: n })),
    ...(counts?.__blank ? [{ value: "__blank", label: none, hint: counts.__blank }] : []),
  ];
  // Every workspace member, not only the ones who already have prospects, so anyone can be picked.
  const assignedOptions: DockFilterOption[] = memberOptions(facets?.names?.member, facets?.assignedTo, me).map((o) => ({
    value: o.value,
    label: o.label,
    hint: o.count,
    ...(o.isMe ? { icon: <User className="w-3.5 h-3.5" /> } : {}),
  }));
  const extra: Array<[keyof DockFilters, string, DockFilterOption[]]> = [
    ["campaign", "Campaign", namedOptions(facets?.campaign, (id) => facets?.names?.campaign?.[id] ?? "Unknown campaign", "No campaign")],
    ["leadSource", "Lead source", namedOptions(facets?.leadSource, optionLabel, "No lead source")],
    ["offer", "Offer", namedOptions(facets?.offer, optionLabel, "No offer")],
    ["industry", "Industry", valueOptions(facets?.industry)],
    ["state", "State", valueOptions(facets?.state)],
    ["city", "City", valueOptions(facets?.city)],
  ];
  const extraActive = extra.filter(([key]) => f[key] !== "all").length;

  const countryRaws = f.country === "line" ? lineRaws : f.country !== "all" ? (countries.get(f.country)?.raws ?? [f.country]) : undefined;
  const query = {
    q: debounced || undefined,
    country: countryRaws?.length ? countryRaws : undefined,
    status: f.status !== "all" ? [f.status] : undefined,
    lastCall: f.lastCall !== "all" ? f.lastCall : undefined,
    type: f.type !== "all" ? [f.type as "prospect" | "lead" | "person"] : undefined,
    industry: f.industry !== "all" ? [f.industry] : undefined,
    state: f.state !== "all" ? [f.state] : undefined,
    city: f.city !== "all" ? [f.city] : undefined,
    campaign: f.campaign !== "all" ? [f.campaign] : undefined,
    assignedTo: f.assignedTo === "all" ? undefined : [resolveMember(f.assignedTo, me)],
    leadSource: f.leadSource !== "all" ? [f.leadSource] : undefined,
    offer: f.offer !== "all" ? [f.offer] : undefined,
  };
  const { data, isFetching, error, refetch } = useQuery({
    queryKey: ["dialer-contact-search", query],
    queryFn: () => contactsApi.page(query, 0),
    staleTime: 30_000,
  });
  const all: ContactRow[] = data?.rows ?? [];
  const rows = all.slice(0, 25);
  const total = data?.totalCount ?? rows.length;
  const filtered = (Object.keys(DOCK_FILTERS) as (keyof DockFilters)[]).some((k) => f[k] !== "all");
  return (
    <div>
      <div className="p-3 pb-2 sticky top-0 z-[1] bg-[var(--ods-bg-primary)] space-y-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ods-text-tertiary)]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, company or number" className={`${INPUT} pl-8`} autoFocus />
        </div>
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <DockFilter label="Country" value={f.country} options={countryOptions} onChange={(v) => set({ country: v })} />
          <DockFilter label="Status" value={f.status} options={statusOptions} onChange={(v) => set({ status: v })} />
          <DockFilter label="Type" value={f.type} options={typeOptions} onChange={(v) => set({ type: v })} />
          <DockFilter label="Assigned" value={f.assignedTo} options={assignedOptions} onChange={(v) => set({ assignedTo: v })} />
          <DockFilter label="Last call" value={f.lastCall} options={lastCallOptions} onChange={(v) => set({ lastCall: v })} />
          <button
            onClick={() => setMore(!more)}
            aria-expanded={more}
            title={more ? "Hide the other filters" : "Filter by assignee, campaign, lead source, offer, type, industry, state and city"}
            className={`h-7 px-2 inline-flex items-center gap-1 rounded-md border text-[12px] font-medium ${
              more || extraActive
                ? "border-[color-mix(in_srgb,var(--ods-brand-600)_40%,transparent)] text-[var(--ods-brand-700)] dark:text-[var(--ods-brand-300)]"
                : "border-[var(--ods-border)] text-[var(--ods-text-secondary)] hover:bg-[var(--ods-hover)]"
            }`}
          >
            <ListFilter className="w-3 h-3" />
            More{extraActive ? ` (${extraActive})` : ""}
          </button>
          {more &&
            extra.map(([key, label, options]) => (
              <DockFilter key={key} label={label} value={f[key]} options={options} onChange={(v) => set({ [key]: v })} />
            ))}
          <SavedFiltersMenu account={account} filtered={filtered} />
          {filtered && (
            <button onClick={() => setFilters(DOCK_FILTERS)} title="Clear filters" aria-label="Clear the contact filters" className={`${BTN_ICON} shrink-0`}>
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {data && (
          <div className="text-[12px] text-[var(--ods-text-tertiary)]">
            {total} {total === 1 ? "contact" : "contacts"}
            {total > rows.length ? `, first ${rows.length} shown` : ""}
          </div>
        )}
      </div>
      {!data && isFetching ? (
        <ListSkeleton />
      ) : !data && error ? (
        // Not "no contacts match": the list did not load (often Twenty's rate limit when many calls are saved at once).
        <div className="p-6 text-center text-[13px] text-[var(--ods-text-tertiary)] space-y-2">
          <p>Contacts did not load. {describeError(error).detail}</p>
          <button onClick={() => void refetch()} className={BTN_SECONDARY}>
            Try again
          </button>
        </div>
      ) : rows.length === 0 ? (
        <Empty text={debounced ? `No contacts match "${debounced}".` : filtered ? "No contacts match these filters." : "No contacts yet."} />
      ) : (
        rows.map((r, index) => {
          const name = contactName(r) ?? "Unknown";
          // A person is called, shown and opened as their company: that is where calls and history are kept.
          const record = rowRecord(r);
          const route = r.phone ? pickCallLine(lines, line, { number: r.phone, country: r.country as string | undefined }) : null;
          const toName = route?.toName ?? "";
          return (
            <ListRow
              key={`${r.type}-${r.id}`}
              icon={Phone}
              iconClass={r.phone ? "text-emerald-600" : "text-[var(--ods-text-tertiary)]"}
              title={name}
              meta={[
                r.phone || "No number",
                r.type === "person" ? [r.jobTitle, r.company].filter(Boolean).join(" at ") : r.company,
                r.assignedToId && facets?.names?.member?.[r.assignedToId] ? `Assigned to ${facets.names.member[r.assignedToId]}` : null,
              ].filter(Boolean).join(" · ")}
              onClick={() => dialFromList(all, index)}
              trailing={
                <span className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => record && contactSide.toggle(record.type, record.id)}
                    disabled={!record}
                    aria-pressed={!!record && contactSide.isShown(record.id)}
                    title="Show the details beside the dialer"
                    aria-label={`Show ${name} beside the dialer`}
                    className={`${BTN_ICON} ${record && contactSide.isShown(record.id) ? "text-[var(--ods-brand-600)]" : "opacity-0 group-hover:opacity-100 focus:opacity-100"}`}
                  >
                    <User className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => record && navigate(record.type === "lead" ? `/leads/${record.id}` : `/contacts/${record.id}`)}
                    title="Open contact"
                    aria-label={`Open ${name}`}
                    className={`${BTN_ICON} opacity-0 group-hover:opacity-100 focus:opacity-100`}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                  {route?.switched && route.line && (
                    <span className="text-[12px] text-[var(--ods-text-tertiary)] tabular-nums" title={`Called from your ${toName} number ${route.line.phoneNumber}, so the call stays local`}>
                      via {route.line.phoneNumber}
                    </span>
                  )}
                  {route?.abroad && (
                    <span
                      role="img"
                      aria-label="International call"
                      title={`In ${toName || "another country"} and you have no free number there, so this is an international call from ${line?.phoneNumber}`}
                      className="inline-flex"
                    >
                      <Globe className="w-3.5 h-3.5 text-amber-600" />
                    </span>
                  )}
                  <CountryFlag code={countryCode(r.country as string | undefined)} />
                </span>
              }
            />
          );
        })
      )}
    </div>
  );
}

const KEYS: Array<[string, string]> = [
  ["1", ""], ["2", "ABC"], ["3", "DEF"],
  ["4", "GHI"], ["5", "JKL"], ["6", "MNO"],
  ["7", "PQRS"], ["8", "TUV"], ["9", "WXYZ"],
  ["*", ""], ["0", "+"], ["#", ""],
];

function Keypad({ onKey }: { onKey: (k: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {KEYS.map(([k, sub]) => (
        <button
          key={k}
          onClick={() => onKey(k)}
          className="h-12 rounded-md bg-[var(--ods-bg-tertiary)] hover:bg-[var(--ods-hover)] active:bg-[var(--ods-active)] flex flex-col items-center justify-center"
        >
          <span className="text-xl font-semibold leading-none">{k}</span>
          {sub && <span className="text-[12px] font-semibold tracking-wider text-[var(--ods-text-tertiary)] mt-0.5">{sub}</span>}
        </button>
      ))}
    </div>
  );
}

function KeypadTab() {
  const { dial } = useDialer();
  const [number, setNumber] = useState("");
  const call = () => number && void dial({ contactType: null, contactId: null, phone: number, name: number });
  return (
    <div className="p-4 flex flex-col gap-3">
      <div className="relative">
        <input
          value={number}
          onChange={(e) => setNumber(e.target.value.replace(/[^\d+*#]/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && call()}
          placeholder="Enter a number"
          inputMode="tel"
          className={`${INPUT} h-11 text-center text-xl font-semibold tabular-nums pr-10`}
        />
        {number && (
          <button onClick={() => setNumber((n) => n.slice(0, -1))} title="Delete" className={`${BTN_ICON} absolute right-1.5 top-1/2 -translate-y-1/2`}>
            <Backspace className="w-4 h-4" />
          </button>
        )}
      </div>
      <Keypad onKey={(k) => setNumber((n) => n + k)} />
      <button onClick={call} disabled={!number} className="h-11 rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-[14px] font-semibold flex items-center justify-center gap-2">
        <Phone className="w-4 h-4" /> Call
      </button>
    </div>
  );
}

function QueueTab() {
  const { queue } = usePowerDialer();
  const { state } = useDialer();
  if (!queue) return <Empty text="No power-dialer session. Start one from a campaign." />;
  return (
    <div className="p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[12px] text-[var(--ods-text-tertiary)]">Campaign</div>
          <div className="text-[15px] font-semibold truncate">{queue.campaignName}</div>
        </div>
        <Chip dot="bg-[var(--ods-brand-600)]">
          {queue.position} of {queue.total}
        </Chip>
      </div>
      <div className="flex items-center gap-2 text-[12px] text-[var(--ods-text-secondary)]">
        <Chip dot="bg-[var(--ods-brand-600)]">{MODE_INFO[queue.mode].label}</Chip>
        <span className="truncate">{MODE_INFO[queue.mode].short}</span>
      </div>
      <QueueCard label="Now" contact={queue.current} />
      <QueueCard label="Next" contact={queue.next} empty="Last contact in this campaign" />
      <div className="grid grid-cols-2 gap-2">
        <button onClick={queue.skip} disabled={isLive(state)} className={BTN_SECONDARY}>
          <SkipForward className="w-3.5 h-3.5" /> {queue.next ? "Next call" : "Finish"}
        </button>
        <button onClick={queue.end} disabled={isLive(state)} className={BTN_SECONDARY}>
          <Square className="w-3.5 h-3.5" /> End session
        </button>
      </div>
    </div>
  );
}

function QueueCard({ label, contact, empty }: { label: string; contact: ContactRow | null; empty?: string }) {
  return (
    <div className="rounded-[10px] border border-[var(--ods-border)] p-3">
      <div className="text-[12px] text-[var(--ods-text-tertiary)]">{label}</div>
      {contact ? (
        <>
          <div className="text-[14px] font-semibold truncate">{contactDisplayName(contact)}</div>
          <div className="text-[12px] tabular-nums text-[var(--ods-text-secondary)] truncate">
            {[contact.phone, contact.company].filter(Boolean).join(" · ")}
          </div>
        </>
      ) : (
        <div className="text-[13px] text-[var(--ods-text-secondary)]">{empty ?? "Loading…"}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- in call

function Avatar({ name }: { name: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
  return (
    <div className="w-14 h-14 rounded-md bg-[color-mix(in_srgb,var(--ods-brand-600)_15%,transparent)] text-[var(--ods-brand-600)] flex items-center justify-center text-xl font-semibold">
      {/^\+?\d/.test(initials) ? <Phone className="w-5 h-5" /> : initials}
    </div>
  );
}

/** What Answer Boost is doing while it checks who picked up. */
const SCREEN_LABEL = {
  listening: "Checking who answered",
  "waiting-beep": "Voicemail: waiting for the beep",
  leaving: "Leaving your voicemail",
} as const;

function CallHeader() {
  const { target, state, duration, direction, screen } = useDialer();
  const name = target?.name || target?.phone || "Unknown";
  return (
    <div className="px-4 pt-4 pb-3 flex flex-col items-center text-center gap-1.5">
      <Avatar name={name} />
      <div className="text-[15px] font-semibold truncate max-w-full">{name}</div>
      {target?.phone && name !== target.phone && <div className="text-[13px] tabular-nums text-[var(--ods-text-secondary)]">{target.phone}</div>}
      <div className="flex items-center gap-2">
        <Chip dot={screen ? "bg-amber-500" : STATE_DOT[state]}>
          {screen ? SCREEN_LABEL[screen] : direction === "inbound" && state !== "ended" ? `Inbound · ${STATE_LABEL[state]}` : STATE_LABEL[state]}
        </Chip>
        <Chip icon={Clock}>
          <span className="tabular-nums">{formatDuration(duration)}</span>
        </Chip>
      </div>
    </div>
  );
}

function ControlButton({
  icon: Icon,
  label,
  active,
  disabled,
  title,
  onClick,
}: {
  icon: IconComponent;
  label: string;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      aria-pressed={active}
      className={`h-16 rounded-md flex flex-col items-center justify-center gap-1 text-[12px] font-semibold transition disabled:opacity-40 ${
        active ? "bg-[var(--ods-brand-600)] text-white" : "bg-[var(--ods-bg-tertiary)] hover:bg-[var(--ods-hover)] text-[var(--ods-text-primary)]"
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}

function InCallView({ scriptOpen, onToggleScript }: { scriptOpen: boolean; onToggleScript: () => void }) {
  const d = useDialer();
  const contactSide = useContactSide();
  const who = d.target?.contactType && d.target.contactId ? { type: d.target.contactType, id: d.target.contactId } : null;
  const [panel, setPanel] = useState<"none" | "keypad" | "notes">("none");
  const connected = d.state === "active" || d.state === "on_hold";
  if (d.legs.length > 1 && !d.legs.some((l) => l.status === "answered")) return <LinesView />;
  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <CallHeader />
      {d.recWarning && (
        <p className="mx-4 mb-2 p-2 rounded-[8px] bg-amber-500/10 text-[12px] text-amber-700">{d.recWarning}. Audio works, but this call will not be recorded.</p>
      )}
      {d.screen === "listening" && (
        <div className="mx-4 mb-2">
          <Notice tone="info">Someone picked up. You will be connected as soon as it is a person, and machines are skipped.</Notice>
        </div>
      )}
      {d.suspectVoicemail && d.state === "active" && (
        <div className="mx-4 mb-2">
          <Notice tone="warning" title="This may be a voicemail">
            A beep was heard just after connecting. End the call if no one is there.
          </Notice>
        </div>
      )}
      <div className="px-4 grid grid-cols-3 gap-2">
        <ControlButton
          icon={d.muted ? MicOff : Mic}
          label={d.muted ? "Unmute" : "Mute"}
          active={d.muted}
          disabled={d.phoneAudio || !connected}
          title={d.phoneAudio ? "Mute on your phone (phone audio)" : undefined}
          onClick={d.mute}
        />
        <ControlButton
          icon={d.held ? Play : Pause}
          label={d.held ? "Resume" : "Hold"}
          active={d.held}
          disabled={d.phoneAudio || !connected}
          title={d.phoneAudio ? "Hold on your phone (phone audio)" : undefined}
          onClick={d.hold}
        />
        <ControlButton icon={Keyboard} label="Keypad" active={panel === "keypad"} disabled={d.phoneAudio} onClick={() => setPanel((p) => (p === "keypad" ? "none" : "keypad"))} />
        <ControlButton icon={FileText} label="Notes" active={panel === "notes"} onClick={() => setPanel((p) => (p === "notes" ? "none" : "notes"))} />
        <ControlButton icon={BookOpen} label="Script" active={scriptOpen} disabled={!d.target?.campaignId} title={d.target?.campaignId ? "Show the call script" : "No campaign script for this contact"} onClick={onToggleScript} />
        <ControlButton
          icon={User}
          label="Contact"
          active={contactSide.isShown(who?.id)}
          disabled={!who}
          title={who ? "Show the business you are calling" : "This number is not a saved contact"}
          onClick={() => who && contactSide.toggle(who.type, who.id)}
        />
      </div>
      {panel === "keypad" && (
        <div className="px-4 pt-3">
          <Keypad onKey={d.sendDtmf} />
        </div>
      )}
      {panel === "notes" && (
        <div className="px-4 pt-3">
          <NotesField />
        </div>
      )}
      <div className="p-4">
        <button onClick={d.hangup} className="w-full h-11 rounded-md bg-red-600 hover:bg-red-700 text-white text-[14px] font-semibold flex items-center justify-center gap-2">
          <PhoneOff className="w-4 h-4" /> End call
        </button>
      </div>
    </div>
  );
}

const LEG_LABEL: Record<LegStatus, string> = {
  dialing: "Calling",
  ringing: "Ringing",
  answered: "Answered",
  no_answer: "No answer",
  failed: "Failed",
};
const LEG_DOT: Record<LegStatus, string> = {
  dialing: "bg-sky-500",
  ringing: "bg-sky-500",
  answered: "bg-emerald-500",
  no_answer: "bg-gray-400",
  failed: "bg-red-500",
};

/** Several lines ringing at once: who each line is calling, from which number, and how far it got. */
function LinesView() {
  const d = useDialer();
  const ringing = d.legs.filter((l) => l.status === "dialing" || l.status === "ringing").length;
  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <span className="text-[15px] font-semibold">Ringing {ringing} of {d.legs.length} lines</span>
        <Chip icon={Clock}>
          <span className="tabular-nums">{formatDuration(d.duration)}</span>
        </Chip>
      </div>
      <p className="px-4 pb-2 text-[12px] text-[var(--ods-text-tertiary)]">The first to answer is put through; the other lines hang up.</p>
      <div className="py-1">
        {d.legs.map((l) => (
          <div key={`${l.phone}-${l.fromNumber}`} className="flex items-center gap-2.5 px-4 py-2">
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-medium truncate">{l.name || l.phone}</span>
              <span className="block text-[12px] text-[var(--ods-text-tertiary)] truncate tabular-nums">
                {l.phone} · from {l.fromNumber}
              </span>
            </span>
            <Chip dot={LEG_DOT[l.status]}>{LEG_LABEL[l.status]}</Chip>
          </div>
        ))}
      </div>
      <div className="p-4">
        <button onClick={d.hangup} className="w-full h-11 rounded-md bg-red-600 hover:bg-red-700 text-white text-[14px] font-semibold flex items-center justify-center gap-2">
          <PhoneOff className="w-4 h-4" /> Stop all lines
        </button>
      </div>
    </div>
  );
}

function NotesField() {
  const { notes, setNotes, notesSaved, notesError, retryNotes } = useDialer();
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label htmlFor="dialer-notes" className="text-[12px] font-semibold text-[var(--ods-text-secondary)]">
          Notes
        </label>
        <span className="text-[12px] text-[var(--ods-text-secondary)] inline-flex items-center gap-1">
          {notesError ? (
            <>
              <span className="text-red-600 font-semibold" title={notesError}>
                Not saved
              </span>
              <button type="button" onClick={retryNotes} className="ods-link">
                Retry
              </button>
            </>
          ) : (
            notes && (notesSaved ? <><Check className="w-3 h-3 text-emerald-600" /> Saved to the call</> : "Saving…")
          )}
        </span>
      </div>
      <textarea
        id="dialer-notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={3}
        placeholder="What was said, next steps…"
        className="w-full resize-none rounded-[8px] border border-[var(--ods-border)] bg-[var(--ods-bg-primary)] px-3 py-2 text-[14px] outline-none focus:border-[var(--ods-brand-500)]"
      />
    </div>
  );
}

// ---------------------------------------------------------------- summary

function SummaryView() {
  const d = useDialer();
  const { on: autoQueue } = useContext(AutoQueueContext);
  const chosen = dispositionFor(d.outcome);
  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <CallHeader />
      {d.failure && (
        <p className="mx-4 mb-2 p-2 rounded-[8px] bg-red-500/10 text-[12px] text-red-700">
          <b>{d.failure.title}.</b> {d.failure.detail}
        </p>
      )}
      <div className="px-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[12px] font-medium text-[var(--ods-text-tertiary)]">Disposition</span>
          {!chosen && <span className="text-[12px] text-[var(--ods-text-secondary)]">{outcomeLabel(d.outcome)}</span>}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {DISPOSITIONS.map((opt) => {
            const selected = d.outcome === opt.value;
            return (
              <button
                key={opt.value}
                // With auto-queue on, the disposition is the last click: it saves and the next call starts.
                onClick={() => (autoQueue ? void d.saveSummary(opt.value) : d.setOutcome(opt.value))}
                disabled={d.saving}
                aria-pressed={selected}
                className={`h-9 px-2.5 rounded-md border text-[13px] font-semibold flex items-center gap-2 text-left transition ${
                  selected
                    ? "border-[var(--ods-brand-600)] bg-[color-mix(in_srgb,var(--ods-brand-600)_10%,transparent)] text-[var(--ods-text-primary)]"
                    : "border-[var(--ods-border)] hover:bg-[var(--ods-hover)] text-[var(--ods-text-secondary)]"
                }`}
              >
                <span className={`w-2 h-2 shrink-0 rounded-md ${opt.type === "positive" ? "bg-emerald-500" : "bg-red-500"}`} />
                <span className="truncate">{opt.label}</span>
                {selected && <Check className="w-3 h-3 ml-auto text-[var(--ods-brand-600)]" />}
              </button>
            );
          })}
        </div>
      </div>
      <div className="px-4 pt-3">
        <NotesField />
      </div>
      <div className="px-4 pt-3">
        <AutoQueueSwitch />
      </div>
      <div className="p-4 grid grid-cols-[1fr_auto] gap-2">
        <button onClick={() => void d.saveSummary()} disabled={d.saving || d.outcome === "connected"} className={BTN_PRIMARY} title={d.outcome === "connected" ? "Pick a disposition first" : undefined}>
          {d.saving ? "Saving…" : d.saveLabel}
        </button>
        <button
          onClick={() => d.target && void d.dial(d.target)}
          disabled={d.saving || !d.target?.phone}
          className={BTN_SECONDARY}
          title="Call again (this summary is discarded)"
        >
          <Phone className="w-3.5 h-3.5" /> Redial
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- settings

function SettingsSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-4 py-3 flex items-center justify-between border-b border-[var(--ods-border)] shrink-0">
        <span className="text-[15px] font-semibold">Dialer settings</span>
        <button onClick={onClose} className={BTN_SECONDARY}>
          Done
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-4 text-[13px] text-[var(--ods-text-secondary)] space-y-4">
        <p>
          Caller ID is the <b className="text-[var(--ods-text-primary)]">Calling from</b> number at the top. Audio below applies to every call on
          this browser.
        </p>
        <DialingModeSettings />
        <AutoQueueSwitch />
        <VoicemailSettings />
        <AudioSourceSettings />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- shared

function Empty({ text }: { text: string }) {
  return <p className="p-6 text-center text-[13px] text-[var(--ods-text-tertiary)]">{text}</p>;
}

function ListSkeleton() {
  return (
    <div className="py-1" role="status" aria-label="Loading">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex items-center gap-2.5 px-3 py-2">
          <div className="w-8 h-8 rounded-md bg-[var(--ods-bg-tertiary)] animate-pulse" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-2/5 rounded-md bg-[var(--ods-bg-tertiary)] animate-pulse" />
            <div className="h-2.5 w-3/5 rounded-md bg-[var(--ods-bg-tertiary)] animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}
