import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useProspectLookup } from "@/lib/contacts";
import { useQuery } from "@tanstack/react-query";
import { MoreVertical, SkipForward, Square } from "@/components/ui/icons";
import { api, type CallCampaign } from "@/lib/api-client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Softphone } from "@/components/softphone/Softphone";
import { SelectMenu } from "@/components/ui/Menu";
import { useToast } from "@/components/ui/Toast";
import { useCalls } from "@/hooks/use-call-logs";
import { useUpdateProspect } from "@/hooks/use-prospects";
import { useUpdateCallCampaign } from "@/hooks/use-call-campaigns";
import { campaignProgress, type CampaignCall } from "@/lib/campaign-stats";
import { recordStatusForOutcome } from "@/lib/call-outcome";

interface Contact {
  id: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  company?: string;
  email?: string;
}

interface PhoneRow {
  id: string;
  phoneNumber: string;
  status?: string;
  callState?: string | null;
  claimedByMemberId?: string | null;
}

interface Session {
  campaign: CallCampaign;
  currentId: string;
  /** Contacts finished in this session (the calls cache can lag a write). */
  done: string[];
}

interface PowerDialerValue {
  /** Start or resume a campaign; the dialer floats over the current page. */
  start: (campaign: CallCampaign) => void;
  active: boolean;
}

const PowerDialerContext = createContext<PowerDialerValue | null>(null);

export function usePowerDialer(): PowerDialerValue {
  const ctx = useContext(PowerDialerContext);
  if (!ctx) throw new Error("usePowerDialer must be used inside PowerDialerProvider");
  return ctx;
}

const nameOf = (c?: Contact | null) => (c ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || c.phone || "Unknown" : "Unknown");

/**
 * Single-line power dialer, WAVV style. Starting a campaign shows a floating
 * dialer card on top of whatever page is open — the screen never changes.
 * It dials the current contact, and after Save & Next rotates to the next
 * contact not yet called, showing who is up next, until the list is done.
 */
export function PowerDialerProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const { data: calls } = useCalls();
  const { error: toastError } = useToast();

  const start = useCallback(
    (campaign: CallCampaign) => {
      const progress = campaignProgress(campaign, (calls ?? []) as unknown as CampaignCall[]);
      const first = progress.remainingIds[0];
      if (!first) {
        toastError("Nothing left to dial", "Every number in this campaign has been called.");
        return;
      }
      setSession({ campaign, currentId: first, done: [] });
    },
    [calls, toastError],
  );

  const value = useMemo(() => ({ start, active: !!session }), [start, session]);

  return (
    <PowerDialerContext.Provider value={value}>
      {children}
      {session && <DialerCard session={session} onChange={setSession} />}
    </PowerDialerContext.Provider>
  );
}

function DialerCard({ session, onChange }: { session: Session; onChange: (s: Session | null) => void }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { success } = useToast();
  const { data: calls } = useCalls();
  const updateProspect = useUpdateProspect();
  const updateCampaign = useUpdateCallCampaign();
  const { data: phones } = useQuery<PhoneRow[]>({ queryKey: ["twentyPhones"], queryFn: () => api.twentyPhones.list(), staleTime: 10_000 });
  const { data: primary } = useQuery({ queryKey: ["primaryPhone"], queryFn: () => api.twentyPhones.primary(), staleTime: 60_000 });

  const { campaign, currentId, done } = session;
  const member = user?.memberId ? { id: user.memberId, email: user.email } : null;

  // Single line: the agency's primary number, unless a teammate holds it.
  const line = useMemo(() => {
    const active = (phones ?? []).filter((p) => !p.status || p.status.toLowerCase() === "active");
    const free = (p: PhoneRow) => (p.callState || "IDLE") === "IDLE" || !p.claimedByMemberId || p.claimedByMemberId === member?.id;
    const primaryId = (primary as any)?.phone?.id;
    const preferred = active.find((p) => p.id === primaryId);
    return preferred && free(preferred) ? preferred : active.find(free) ?? preferred ?? null;
  }, [phones, primary, member?.id]);

  // Remaining order: campaign order, skipping anyone called (cache) or finished this session.
  const progress = campaignProgress(campaign, (calls ?? []) as unknown as CampaignCall[]);
  const pending = progress.remainingIds.filter((id) => !done.includes(id) && id !== currentId);
  const order = campaign.contactIds;
  const nextId = pending.find((id) => order.indexOf(id) > order.indexOf(currentId)) ?? pending[0] ?? null;
  // Just the two contacts on screen, looked up by id (never the whole list).
  const { data: lookedUp } = useProspectLookup([currentId, nextId]);
  const contact = (lookedUp?.get(currentId) as Contact | undefined) ?? null;
  const next = nextId ? ((lookedUp?.get(nextId) as Contact | undefined) ?? null) : null;
  const finished = new Set([...done, ...campaign.contactIds.filter((id) => !progress.remainingIds.includes(id))]);
  const position = Math.min(finished.size + 1, order.length);

  const advance = () => {
    const nowDone = [...done, currentId];
    if (nextId) {
      onChange({ campaign, currentId: nextId, done: nowDone });
      return;
    }
    updateCampaign.mutate({ id: campaign.id, patch: { status: "completed" } });
    success("Campaign complete", `Every number in "${campaign.name}" has been dialed.`);
    onChange(null);
  };

  const handleCallEnd = (data: { outcome: string }) => {
    const status = recordStatusForOutcome(data.outcome);
    if (status) updateProspect.mutate({ id: currentId, patch: { status } });
    advance();
  };

  const menu = (
    <SelectMenu
      value={null}
      placement="bottom-end"
      width={220}
      onChange={(v) => {
        if (v === "skip") advance();
        if (v === "open") navigate(`/contacts/${currentId}`);
        if (v === "end") onChange(null);
      }}
      sections={[
        {
          title: campaign.name,
          options: [
            { value: "skip", label: next ? `Skip to ${nameOf(next)}` : "Skip (last contact)" },
            { value: "open", label: "Open contact details" },
            { value: "end", label: "End dialing session" },
          ],
        },
      ]}
      triggerTitle="Dialer options"
      triggerClassName="p-1 rounded-[6px] text-white/70 hover:text-white hover:bg-white/10"
      trigger={<MoreVertical className="w-4 h-4" />}
    />
  );

  const footer = (
    <div className="flex items-center justify-between gap-3 text-white/70">
      <span className="truncate">
        {next ? (
          <>
            Next: <b className="text-white">{nameOf(next)}</b>
            {next.phone && <span className=""> · {next.phone}</span>}
          </>
        ) : (
          "Last contact in this campaign"
        )}
      </span>
      <span className="shrink-0 tabular-nums">
        {position} of {order.length}
      </span>
    </div>
  );

  return (
    <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[55]" aria-label="Power dialer">
      {contact ? (
        <Softphone
          key={currentId}
          variant="compact"
          lead={contact as any}
          prospectId={currentId}
          callerId={line?.phoneNumber}
          phoneId={line?.id ?? null}
          member={member}
          autoDial={!!contact.phone && !!member && !!line}
          compactMenu={menu}
          compactFooter={footer}
          onCallEnd={handleCallEnd}
        />
      ) : (
        <div className="dark w-[380px] rounded-[12px] border border-white/10 bg-[#0b1622] p-4 text-center text-[13px] text-white/70 shadow-2xl">
          Loading contact…
          <div className="mt-3 flex justify-center gap-2">
            <button onClick={advance} className="h-8 px-3 rounded-md bg-white/10 text-white flex items-center gap-1.5">
              <SkipForward className="w-3.5 h-3.5" /> Skip
            </button>
            <button onClick={() => onChange(null)} className="h-8 px-3 rounded-md bg-white/10 text-white flex items-center gap-1.5">
              <Square className="w-3.5 h-3.5" /> End
            </button>
          </div>
        </div>
      )}
      {!line && contact && (
        <p className="mt-2 rounded-[8px] bg-amber-500/90 px-3 py-1.5 text-center text-[12px] font-medium text-black">
          No free sending number to dial from. Check Phone Numbers.
        </p>
      )}
    </div>
  );
}
