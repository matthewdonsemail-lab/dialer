import React, { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageSquare, Send } from "lucide-react";
import { api } from "@/lib/api-client";
import { useMessageThread, useSendMessage } from "@/hooks/useMessages";
import { useToast } from "@/components/ui/Toast";

export interface ComposerTemplate {
  label: string;
  text: string;
}

function statusLabel(status: string | null): string | null {
  if (!status) return null;
  const s = status.toLowerCase();
  if (s === "delivered") return "Delivered";
  if (s === "sent" || s === "queued") return "Sent";
  if (s === "failed" || s === "undelivered") return "Failed";
  if (s === "received") return null;
  return status;
}

/**
 * Reference-style conversations pane: message thread plus a composer with a
 * sending-number selector and quick-command chips. The thread is the
 * agencyMessages ledger in Twenty (both directions); sending goes through
 * the backend's Telnyx send, which mirrors blaster's profile rules.
 */
export function ConversationsWidget({
  prospectId,
  leadId,
  toPhone,
  personName,
  templates,
}: {
  prospectId?: string | null;
  leadId?: string | null;
  toPhone: string;
  personName: string;
  templates?: ComposerTemplate[];
}) {
  const { success, error: toastError } = useToast();
  const [draft, setDraft] = useState("");
  const [fromId, setFromId] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);

  const record = { prospectId: prospectId ?? null, leadId: leadId ?? null };
  const { data: messages, isLoading, isError } = useMessageThread(record);
  const sendMutation = useSendMessage(record);

  const { data: phones } = useQuery({
    queryKey: ["twentyPhones"],
    queryFn: async () => api.twentyPhones.list(),
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
  const senders = (phones ?? []).filter(
    (p: any) =>
      (p.state || p.status || "ACTIVE").toString().toUpperCase() === "ACTIVE" && p.messagingProfileId,
  );
  const selected = senders.find((p: any) => p.id === fromId) ?? senders[0] ?? null;
  useEffect(() => {
    if (!fromId && senders[0]) setFromId(senders[0].id);
  }, [fromId, senders]);

  const thread = messages ?? [];
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread.length]);

  function insertTemplate(text: string) {
    setDraft((prev) => (prev ? `${prev.trimEnd()} ${text}` : text));
  }

  async function handleSend() {
    const text = draft.trim();
    if (!text || !toPhone || sendMutation.isPending) return;
    if (!selected) {
      toastError("No sending number", "Add a messaging number (agencyPhones with messagingProfileId) first");
      return;
    }
    try {
      const res = await sendMutation.mutateAsync({ to: toPhone, fromPhoneId: selected.id, body: text });
      setDraft("");
      if ((res as any)?.resolution?.warning) {
        success("Sent with a warning", (res as any).resolution.warning);
      } else {
        success("Message sent", `Sent to ${toPhone}`);
      }
    } catch (err: any) {
      toastError("Send failed", err?.message ?? "Could not send the message");
    }
  }

  return (
    <div className="flex flex-col h-[560px]">
      {/* Thread */}
      <div ref={threadRef} className="flex-1 overflow-y-auto flex flex-col gap-2 pr-1 min-h-0">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[12px] text-[var(--ods-text-tertiary)]">Loading conversation…</p>
          </div>
        ) : isError ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-1 text-center px-4">
            <MessageSquare className="w-6 h-6 text-[var(--ods-text-tertiary)] opacity-50" />
            <p className="text-[12px] text-[var(--ods-text-secondary)]">Messaging isn't set up yet</p>
            <p className="text-[11px] text-[var(--ods-text-tertiary)]">
              Run POST /api/setup/twenty once to create the message ledger.
            </p>
          </div>
        ) : thread.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-1 text-center px-4">
            <MessageSquare className="w-6 h-6 text-[var(--ods-text-tertiary)] opacity-50" />
            <p className="text-[12px] text-[var(--ods-text-secondary)]">No messages yet</p>
            <p className="text-[11px] text-[var(--ods-text-tertiary)]">
              Say hello to {personName} below — the thread lives here afterwards.
            </p>
          </div>
        ) : (
          thread.map((m) => {
            const outbound = (m.direction || "OUTBOUND").toUpperCase() === "OUTBOUND";
            const failed = (m.status || "").toLowerCase() === "failed" || (m.status || "").toLowerCase() === "undelivered";
            return (
              <div key={m.id} className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-[10px] px-3 py-2 ${
                    outbound
                      ? "bg-[var(--ods-brand-600)] text-white rounded-br-[2px]"
                      : "bg-[var(--ods-bg-secondary)] border border-[var(--ods-border)] text-[var(--ods-text-primary)] rounded-bl-[2px]"
                  }`}
                >
                  <p className="text-[13px] whitespace-pre-wrap break-words">{m.body}</p>
                  <p
                    className={`text-[10px] mt-1 text-right ${
                      outbound ? "text-white/70" : "text-[var(--ods-text-tertiary)]"
                    }`}
                  >
                    {m.createdAt ? new Date(m.createdAt).toLocaleString() : ""}
                    {outbound && statusLabel(m.status) ? ` · ${statusLabel(m.status)}` : ""}
                    {failed ? " · failed" : ""}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Composer */}
      <div className="mt-3 pt-3 border-t border-[var(--ods-border)]">
        {templates && templates.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap mb-2">
            {templates.map((t) => (
              <button
                key={t.label}
                type="button"
                onClick={() => insertTemplate(t.text)}
                title={`Insert: ${t.text.slice(0, 80)}`}
                className="text-[11px] px-2 py-1 rounded-full border border-[var(--ods-border)] text-[var(--ods-text-secondary)] hover:text-[var(--ods-text-primary)] hover:border-[var(--ods-brand-500)]"
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <select
            value={selected?.id ?? ""}
            onChange={(e) => setFromId(e.target.value)}
            title="Sending number"
            className="max-w-[150px] px-2 py-2 text-[12px] border border-[var(--ods-border)] rounded-[8px] bg-[var(--ods-bg-primary)] text-[var(--ods-text-primary)] outline-none focus:border-[var(--ods-brand-500)] cursor-pointer truncate"
          >
            {senders.length === 0 && <option value="">No numbers</option>}
            {senders.map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.phoneNumber || p.name}
              </option>
            ))}
          </select>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder={`Message ${toPhone || "…"}`}
            maxLength={1600}
            className="flex-1 min-w-0 px-3 py-2 text-[13px] border border-[var(--ods-border)] rounded-[8px] bg-[var(--ods-bg-primary)] text-[var(--ods-text-primary)] placeholder:text-[var(--ods-text-tertiary)] outline-none focus:border-[var(--ods-brand-500)]"
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!draft.trim() || sendMutation.isPending}
            title="Send SMS"
            aria-label="Send SMS"
            className="p-2 rounded-[8px] bg-[var(--ods-brand-600)] text-white hover:bg-[var(--ods-brand-700)] disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[10px] text-[var(--ods-text-tertiary)] mt-1.5">
          {selected ? `Sending as ${selected.phoneNumber || selected.name}` : "No messaging number available"} · {draft.length}/1600
        </p>
      </div>
    </div>
  );
}
