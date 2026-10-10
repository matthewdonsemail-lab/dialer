import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  Pause,
  Phone,
  PhoneIncoming,
  PhoneOff,
  PhoneOutgoing,
  Pin,
  Play,
  Search,
  Settings,
  SkipForward,
  Square,
  User,
  Users,
  X,
  type IconComponent,
} from "@/domains/ui/icons";
import { Chip } from "@/domains/ui/chip";
import { SelectMenu } from "@/domains/ui/menu";
import { TabBar } from "@/domains/ui/tabBar";
import { CountryFlag } from "@/domains/country/badge";
import { DispositionBadge, DispositionIcon } from "@/domains/calls/disposition";
import { AudioSourceSettings } from "@/domains/dialer/audio";
import { CallScriptViewer } from "@/domains/scripts/viewer";
import { usePowerDialer, contactDisplayName } from "@/domains/campaigns/powerDialer";
import { usePersistedState } from "@/domains/app/persistedState";
import { DEFAULT_UNANSWERED_TIMEOUT_SECONDS, UNANSWERED_TIMEOUT_CHOICES, getUnansweredTimeoutSeconds, setUnansweredTimeoutSeconds } from "@/domains/app/config";
import { useCalls } from "@/domains/calls/data";
import { contactsApi, contactName, useContactFacets, useProspectLookup, type ContactRow } from "@/domains/contact/list";
import { lineCountry, lineRegion, pickCallLine } from "@/domains/dialer/route";
import { DockContactPanel } from "@/domains/dialer/contactPanel";
import { regionOfCountry } from "@dialer/shared";
import { countryCode, countryName } from "@/domains/country/lookup";
import { DISPOSITIONS, dispositionFor, outcomeLabel } from "@/domains/calls/disposition";
import { isLive, useDialer, type CallState } from "@/domains/dialer/provider";

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
    </div>
    </SideContext.Provider>
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
  const { lines, line, setLine, state } = useDialer();
  const locked = state !== "idle";
  return (
    <div className="h-12 shrink-0 px-3 flex items-center gap-2 border-b border-[var(--ods-border)]">
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-medium text-[var(--ods-text-tertiary)] leading-none mb-0.5">Calling from</div>
        <SelectMenu
          value={line?.id ?? null}
          onChange={setLine}
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
          ]}
          triggerTitle={locked ? "Change the number between calls" : "Choose the number you call from"}
          triggerClassName="max-w-full inline-flex items-center gap-1.5 text-[14px] font-semibold tabular-nums disabled:opacity-70"
          trigger={
            <>
              {line && <CountryFlag code={countryCode(line.countryCode)} />}
              <span className="truncate">{line?.phoneNumber ?? "No free number"}</span>
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

type IdleTab = "recents" | "contacts" | "keypad" | "queue";

function IdleView() {
  const { cooldownNotice, dialAnyway, discardSummary, target } = useDialer();
  const { queue } = usePowerDialer();
  const [tab, setTab] = usePersistedState<IdleTab>("dialer-tab", "recents");
  const shown = queue ? tab : tab === "queue" ? "recents" : tab;
  const tabs = [
    { key: "recents" as const, label: "Recents", icon: Clock },
    { key: "contacts" as const, label: "Contacts", icon: Users },
    { key: "keypad" as const, label: "Keypad", icon: Keyboard },
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
        {shown === "queue" && <QueueTab />}
      </div>
      <div className="p-2 border-t border-[var(--ods-border)] shrink-0">
        <TabBar tabs={tabs} value={shown} onChange={setTab} />
      </div>
    </>
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
}
const DOCK_FILTERS: DockFilters = { country: "all", status: "all", lastCall: "all", type: "all", industry: "all", state: "all", city: "all" };
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

function ContactsTab() {
  const { dial, lines, line } = useDialer();
  const navigate = useNavigate();
  const contactSide = useContactSide();
  const [more, setMore] = usePersistedState("dialer-contact-more-filters", false);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [saved, setFilters] = usePersistedState<DockFilters>("dialer-contact-filters", DOCK_FILTERS);
  const f = { ...DOCK_FILTERS, ...saved };
  const set = (patch: Partial<DockFilters>) => setFilters({ ...f, ...patch });
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
  ];
  const extra: Array<[keyof DockFilters, string, DockFilterOption[]]> = [
    ["type", "Type", typeOptions],
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
    type: f.type !== "all" ? [f.type as "prospect" | "lead"] : undefined,
    industry: f.industry !== "all" ? [f.industry] : undefined,
    state: f.state !== "all" ? [f.state] : undefined,
    city: f.city !== "all" ? [f.city] : undefined,
  };
  const { data, isFetching } = useQuery({
    queryKey: ["dialer-contact-search", query],
    queryFn: () => contactsApi.page(query, 0),
    staleTime: 30_000,
  });
  const rows: ContactRow[] = (data?.rows ?? []).slice(0, 25);
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
          <DockFilter label="Last call" value={f.lastCall} options={lastCallOptions} onChange={(v) => set({ lastCall: v })} />
          <button
            onClick={() => setMore(!more)}
            aria-expanded={more}
            title={more ? "Hide the other filters" : "Filter by type, industry, state and city"}
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
          {filtered && (
            <button onClick={() => setFilters(DOCK_FILTERS)} title="Clear filters" aria-label="Clear the contact filters" className={`${BTN_ICON} ml-auto shrink-0`}>
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
      ) : rows.length === 0 ? (
        <Empty text={debounced ? `No contacts match "${debounced}".` : filtered ? "No contacts match these filters." : "No contacts yet."} />
      ) : (
        rows.map((r) => {
          const name = contactName(r) ?? "Unknown";
          const route = r.phone ? pickCallLine(lines, line, { number: r.phone, country: r.country as string | undefined }) : null;
          const toName = route?.toName ?? "";
          return (
            <ListRow
              key={`${r.type}-${r.id}`}
              icon={Phone}
              iconClass={r.phone ? "text-emerald-600" : "text-[var(--ods-text-tertiary)]"}
              title={name}
              meta={[r.phone || "No number", r.company].filter(Boolean).join(" · ")}
              onClick={() =>
                r.phone &&
                void dial({ contactType: r.type, contactId: r.id, phone: r.phone, name, campaignId: (r.campaign_id as string | null) ?? null, country: (r.country as string | undefined) ?? null })
              }
              trailing={
                <span className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => contactSide.toggle(r.type, r.id)}
                    aria-pressed={contactSide.isShown(r.id)}
                    title="Show the details beside the dialer"
                    aria-label={`Show ${name} beside the dialer`}
                    className={`${BTN_ICON} ${contactSide.isShown(r.id) ? "text-[var(--ods-brand-600)]" : "opacity-0 group-hover:opacity-100 focus:opacity-100"}`}
                  >
                    <User className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => navigate(r.type === "lead" ? `/leads/${r.id}` : `/contacts/${r.id}`)}
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

function CallHeader() {
  const { target, state, duration, direction } = useDialer();
  const name = target?.name || target?.phone || "Unknown";
  return (
    <div className="px-4 pt-4 pb-3 flex flex-col items-center text-center gap-1.5">
      <Avatar name={name} />
      <div className="text-[15px] font-semibold truncate max-w-full">{name}</div>
      {target?.phone && name !== target.phone && <div className="text-[13px] tabular-nums text-[var(--ods-text-secondary)]">{target.phone}</div>}
      <div className="flex items-center gap-2">
        <Chip dot={STATE_DOT[state]}>{direction === "inbound" && state !== "ended" ? `Inbound · ${STATE_LABEL[state]}` : STATE_LABEL[state]}</Chip>
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
  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <CallHeader />
      {d.recWarning && (
        <p className="mx-4 mb-2 p-2 rounded-[8px] bg-amber-500/10 text-[12px] text-amber-700">{d.recWarning}. Audio works, but this call will not be recorded.</p>
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
                onClick={() => d.setOutcome(opt.value)}
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
        <RingTimeSetting />
        <AudioSourceSettings />
      </div>
    </div>
  );
}

/** How long a call rings before the dialer logs No answer and stops it. */
function RingTimeSetting() {
  const [seconds, setSeconds] = useState(getUnansweredTimeoutSeconds);
  return (
    <div>
      <div className="text-[12px] font-semibold text-[var(--ods-text-secondary)] mb-1">Ring for</div>
      <SelectMenu
        value={String(seconds)}
        onChange={(v) => {
          const n = Number(v);
          setUnansweredTimeoutSeconds(n);
          setSeconds(n);
        }}
        width={220}
        sections={[
          {
            title: "Give up after",
            options: UNANSWERED_TIMEOUT_CHOICES.map((n) => ({ value: String(n), label: `${n} seconds of ringing`, hint: n === DEFAULT_UNANSWERED_TIMEOUT_SECONDS ? "default" : undefined })),
          },
        ]}
        triggerTitle="How long a call rings before it is logged as No answer"
        triggerClassName="h-8 px-2.5 inline-flex items-center gap-1.5 rounded-md border border-[var(--ods-border)] text-[13px] text-[var(--ods-text-primary)] hover:bg-[var(--ods-hover)]"
        trigger={
          <>
            {seconds} seconds of ringing
            <ChevronDown className="w-3 h-3 opacity-60" />
          </>
        }
      />
      <p className="mt-1 text-[12px] text-[var(--ods-text-tertiary)]">Counted from the first ring. Most businesses answer within 4 to 6 rings (20 to 30 seconds).</p>
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
