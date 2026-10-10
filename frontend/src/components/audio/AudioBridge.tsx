import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Headphones, Phone, PhoneOff } from "@/components/ui/icons";
import { api, type AudioSessionView } from "@/lib/api-client";
import { useAudioSettings } from "@/hooks/use-audio-settings";
import { useToast } from "@/components/ui/Toast";

interface AudioBridgeValue {
  /** The open phone line (polled), or null. */
  session: AudioSessionView | null;
  /**
   * Phone audio only: open the line if needed and wait until the operator is
   * connected. Resolves null if they cancel or the line fails.
   */
  ensureReady: (fromNumber: string) => Promise<AudioSessionView | null>;
  end: () => Promise<void>;
}

const AudioBridgeContext = createContext<AudioBridgeValue | null>(null);

export function useAudioBridge(): AudioBridgeValue {
  const ctx = useContext(AudioBridgeContext);
  if (!ctx) throw new Error("useAudioBridge must be used inside AudioBridgeProvider");
  return ctx;
}

const LIVE = new Set(["calling_agent", "waiting_dial_in", "ready"]);

function pretty(n: string | null | undefined): string {
  const d = String(n ?? "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  return n ?? "";
}

/**
 * Phone audio (Settings -> Audio Source: Call me / Dial in). Holds one phone
 * line per operator for the whole app, polls it, and shows WAVV's prompts:
 * "Calling you from..." with Stop, or "Dial ... then enter pin ...".
 */
export function AudioBridgeProvider({ children }: { children: ReactNode }) {
  const { source, callMeNumber } = useAudioSettings();
  const { error: toastError } = useToast();
  const [session, setSession] = useState<AudioSessionView | null>(null);
  const waiter = useRef<((s: AudioSessionView | null) => void) | null>(null);
  const fromRef = useRef("");

  const settle = useCallback((value: AudioSessionView | null) => {
    waiter.current?.(value);
    waiter.current = null;
  }, []);

  // Poll the open line; resolve a pending ensureReady when it connects or fails.
  useEffect(() => {
    if (!session || !LIVE.has(session.status)) return;
    const id = session.id;
    const timer = setInterval(async () => {
      try {
        const next = await api.audioSessions.get(id);
        setSession(next);
        if (next.status === "ready") settle(next);
        if (next.status === "failed" || next.status === "ended") {
          settle(null);
          if (next.status === "failed") toastError("Phone audio did not connect", next.error ?? "Try again.");
        }
      } catch {
        // transient; keep polling
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [session?.id, session?.status, settle, toastError]);

  const ensureReady = useCallback(
    async (fromNumber: string) => {
      if (source === "computer") return null;
      if (session?.status === "ready") return session;
      fromRef.current = fromNumber;
      const wait = new Promise<AudioSessionView | null>((resolve) => {
        waiter.current?.(null);
        waiter.current = resolve;
      });
      if (!session || !LIVE.has(session.status)) {
        if (source === "call_me" && !callMeNumber) {
          settle(null);
          toastError("No phone number for Call me", "Add your number in Settings → Audio Source.");
          return null;
        }
        try {
          const opened = await api.audioSessions.open({ mode: source, agentPhone: callMeNumber, from: fromNumber });
          setSession(opened);
        } catch (err: any) {
          settle(null);
          toastError("Phone audio did not start", err?.message || "Check Settings → Audio Source.");
          return null;
        }
      }
      return wait;
    },
    [source, session, callMeNumber, settle, toastError],
  );

  const end = useCallback(async () => {
    const current = session;
    settle(null);
    setSession(null);
    if (current && LIVE.has(current.status)) await api.audioSessions.end(current.id).catch(() => {});
  }, [session, settle]);

  // Switching to computer audio closes any phone line.
  useEffect(() => {
    if (source === "computer" && session && LIVE.has(session.status)) void end();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  const value = useMemo(() => ({ session, ensureReady, end }), [session, ensureReady, end]);

  return (
    <AudioBridgeContext.Provider value={value}>
      {children}
      {session && session.status === "calling_agent" && (
        <BridgeCard>
          <p className="text-[13px] text-white/60">The dialer is calling you at</p>
          <p className="text-[18px] font-semibold tabular-nums">{pretty(session.agentPhone)} …</p>
          <p className="text-[12px] text-white/60 mt-1">Answer your phone to connect.</p>
          <button onClick={end} className="mt-3 w-full h-10 rounded-md bg-[#f87171] hover:bg-[#ef4444] text-[14px] font-semibold">
            Stop
          </button>
        </BridgeCard>
      )}
      {session && session.status === "waiting_dial_in" && (
        <BridgeCard>
          <p className="text-[16px] font-semibold text-left">Connect to Dialer</p>
          <p className="mt-1 text-[14px] text-white/70 text-left">
            Dial <b className="text-white tabular-nums">{pretty(session.dialInNumber)}</b> then enter PIN{" "}
            <b className="text-white tabular-nums tracking-widest">{session.pin}</b> to begin.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button onClick={end} className="h-9 px-4 rounded-md text-[13px] font-semibold text-white/80 hover:bg-white/10">
              Cancel
            </button>
            {session.dialInNumber && (
              <a href={`tel:${session.dialInNumber}`} className="h-9 px-4 rounded-md bg-[#3b82f6] text-[13px] font-semibold flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5" /> Call now
              </a>
            )}
          </div>
        </BridgeCard>
      )}
      {session && session.status === "ready" && (
        <div className="dark fixed bottom-4 right-20 z-[56] flex items-center gap-2 rounded-md border border-white/10 bg-[#0b1622] pl-3 pr-1 py-1 text-[12px] text-white shadow-xl">
          <Headphones className="w-3.5 h-3.5 text-[#22c55e]" />
          Phone line connected ({session.mode === "call_me" ? "Call me" : "Dial in"})
          <button onClick={end} title="Hang up your phone line" className="ml-1 h-7 px-2.5 rounded-md bg-white/10 hover:bg-white/15 flex items-center gap-1">
            <PhoneOff className="w-3 h-3" /> End line
          </button>
        </div>
      )}
    </AudioBridgeContext.Provider>
  );
}

function BridgeCard({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 top-12 z-[57] flex justify-center pointer-events-none">
      <div className="dark pointer-events-auto w-[380px] max-w-[calc(100vw-24px)] rounded-[12px] border border-white/10 bg-[#0b1622] p-4 text-center text-white shadow-[0_16px_40px_rgba(0,0,0,0.45)]">
        {children}
      </div>
    </div>
  );
}
