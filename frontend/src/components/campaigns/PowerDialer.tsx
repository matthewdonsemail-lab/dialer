import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { describeError } from "@/domains/feedback";
import { useProspectLookup, type ContactRow } from "@/lib/contacts";
import { type CallCampaign } from "@/lib/api-client";
import { useToast } from "@/components/ui/Toast";
import { useCalls } from "@/hooks/use-call-logs";
import { useUpdateCallCampaign } from "@/hooks/use-call-campaigns";
import { campaignProgress, type CampaignCall } from "@/lib/campaign-stats";
import { useDialer } from "@/components/dialer/DialerProvider";

interface Session {
  campaign: CallCampaign;
  currentId: string;
  /** Contacts finished in this session (the calls cache can lag a write). */
  done: string[];
}

export interface QueueView {
  campaignName: string;
  position: number;
  total: number;
  current: ContactRow | null;
  next: ContactRow | null;
  skip: () => void;
  end: () => void;
}

interface PowerDialerValue {
  /** Start or resume a campaign; calls run in the dialer dock over any page. */
  start: (campaign: CallCampaign) => void;
  active: boolean;
  /** The running session, for the dock's Queue tab. */
  queue: QueueView | null;
}

const PowerDialerContext = createContext<PowerDialerValue | null>(null);

export function usePowerDialer(): PowerDialerValue {
  const ctx = useContext(PowerDialerContext);
  if (!ctx) throw new Error("usePowerDialer must be used inside PowerDialerProvider");
  return ctx;
}

export const contactDisplayName = (c?: Pick<ContactRow, "first_name" | "last_name" | "phone"> | null) =>
  c ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || c.phone || "Unknown" : "Unknown";

/**
 * Single-line power dialer. Starting a campaign dials its first contact in
 * the dialer dock; "Save & next" on the call summary moves to the next
 * contact not yet called, until the list is done. The page never changes.
 */
export function PowerDialerProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [queue, setQueue] = useState<QueueView | null>(null);
  const { data: calls } = useCalls();
  const { warning: toastWarning } = useToast();

  const start = useCallback(
    (campaign: CallCampaign) => {
      const progress = campaignProgress(campaign, (calls ?? []) as unknown as CampaignCall[]);
      const first = progress.remainingIds[0];
      if (!first) {
        toastWarning("Nothing left to dial", "Every number in this campaign has been called.");
        return;
      }
      setSession({ campaign, currentId: first, done: [] });
    },
    [calls, toastWarning],
  );

  useEffect(() => {
    if (!session) setQueue(null);
  }, [session]);

  const value = useMemo(() => ({ start, active: !!session, queue }), [start, session, queue]);

  return (
    <PowerDialerContext.Provider value={value}>
      {children}
      {session && <PowerDialerDriver session={session} onChange={setSession} onQueue={setQueue} />}
    </PowerDialerContext.Provider>
  );
}

/** Feeds the session's contacts to the dialer one at a time. Renders nothing. */
function PowerDialerDriver({
  session,
  onChange,
  onQueue,
}: {
  session: Session;
  onChange: (s: Session | null) => void;
  onQueue: (q: QueueView | null) => void;
}) {
  const dialer = useDialer();
  const { success, warning, error: toastError } = useToast();
  const { data: calls } = useCalls();
  const updateCampaign = useUpdateCallCampaign();
  const { campaign, currentId, done } = session;

  // Remaining order: campaign order, skipping anyone called (cache) or finished this session.
  const progress = campaignProgress(campaign, (calls ?? []) as unknown as CampaignCall[]);
  const pending = progress.remainingIds.filter((id) => !done.includes(id) && id !== currentId);
  const order = campaign.contactIds;
  const nextId = pending.find((id) => order.indexOf(id) > order.indexOf(currentId)) ?? pending[0] ?? null;
  // Just the two contacts in view, looked up by id (never the whole list).
  const { data: lookedUp } = useProspectLookup([currentId, nextId]);
  const current = lookedUp?.get(currentId) ?? null;
  const next = nextId ? (lookedUp?.get(nextId) ?? null) : null;
  const finished = new Set([...done, ...campaign.contactIds.filter((id) => !progress.remainingIds.includes(id))]);
  const position = Math.min(finished.size + 1, order.length);

  const sessionRef = useRef(session);
  sessionRef.current = session;
  const nextIdRef = useRef(nextId);
  nextIdRef.current = nextId;

  const advance = useCallback(() => {
    const s = sessionRef.current;
    const following = nextIdRef.current;
    const nowDone = [...s.done, s.currentId];
    if (following) {
      onChange({ campaign: s.campaign, currentId: following, done: nowDone });
      return;
    }
    updateCampaign.mutate(
      { id: s.campaign.id, patch: { status: "completed" } },
      { onError: (err) => toastError("Campaign not marked complete", describeError(err).detail) },
    );
    success("Campaign complete", `Every number in "${s.campaign.name}" has been dialed.`);
    onChange(null);
  }, [onChange, success, updateCampaign]);

  const end = useCallback(() => onChange(null), [onChange]);

  const skip = useCallback(() => {
    if (dialer.state !== "idle") dialer.discardSummary();
    advance();
  }, [advance, dialer]);

  useEffect(() => {
    onQueue({ campaignName: campaign.name, position, total: order.length, current, next, skip, end });
  }, [onQueue, campaign.name, position, order.length, current, next, skip, end]);

  // Dial each contact once, as soon as it is looked up and the dialer is free.
  // Without a free line it waits, and dials once one is picked in the dock.
  const dialedRef = useRef<string | null>(null);
  const warnedRef = useRef(false);
  const { state, line, dial } = dialer;
  useEffect(() => {
    if (!current || dialedRef.current === currentId || state !== "idle") return;
    if (!current.phone) {
      dialedRef.current = currentId;
      warning("Skipped a contact", `${contactDisplayName(current)} has no phone number.`);
      advance();
      return;
    }
    if (!line) {
      if (!warnedRef.current) warning("No free sending number", "Pick a number under Calling from in the dialer.");
      warnedRef.current = true;
      return;
    }
    dialedRef.current = currentId;
    void dial(
      {
        contactType: "prospect",
        contactId: currentId,
        phone: current.phone,
        name: contactDisplayName(current),
        campaignId: (current.campaign_id as string | null | undefined) ?? null,
      },
      { saveLabel: "Save & next", onSaved: advance },
    );
  }, [current, currentId, state, line, dial, advance, warning]);

  return null;
}
