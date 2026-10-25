import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageSquare, Send } from "@/domains/ui/icons";
import { api } from "@/domains/api/client";
import { useContactTexts, useSendText } from "./useContactTexts";
import { useToast } from "@/domains/ui/toast";
import { countSms } from "@/domains/messaging/smsCount";

export interface ComposerTemplate {
  label: string;
  text: string;
}

const DEFAULT_TEMPLATES: ComposerTemplate[] = [
  { label: "Quick intro", text: "Hi there! I saw your business listing and wanted to quickly introduce myself." },
  { label: "Follow up", text: "Just checking in to see if you had a moment to review my earlier message?" },
  { label: "Call request", text: "Are you free for a brief 2-minute phone call today?" },
];

function statusLabel(status: string | null): string | null {
  if (!status) return null;
  const s = status.toLowerCase();
  if (s === "delivered") return "Delivered";
  if (s === "sent" || s === "queued") return "Sent";
  if (s === "failed" || s === "undelivered" || s === "not_sent") return "Failed";
  if (s === "received") return null;
  return status;
}

export function ConversationsWidget({
  contactType,
  contactId,
  toPhone,
  personName,
  templates = DEFAULT_TEMPLATES,
}: {
  contactType: "prospect" | "lead";
  contactId: string;
  toPhone: string;
  personName: string;
  templates?: ComposerTemplate[];
}) {
  const { error: toastError, info: toastInfo } = useToast();
  const [draft, setDraft] = useState("");
  const [fromId, setFromId] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);

  const contactRef = { type: contactType, id: contactId };
  const { data: threadData, isLoading, isError } = useContactTexts(contactRef);
  const sendMutation = useSendText(contactRef);

  const { data: phones } = useQuery({
    queryKey: ["twentyPhones"],
    queryFn: async () => api.twentyPhones.list(),
    staleTime: 10_000,
  });

  const senders = (phones ?? []).filter(
    (p: any) => (p.state || p.status || "ACTIVE").toString().toUpperCase() === "ACTIVE",
  );
  const selected = senders.find((p: any) => p.id === fromId) ?? senders[0] ?? null;

  useEffect(() => {
    if (!fromId && senders[0]) setFromId(senders[0].id);
  }, [fromId, senders]);

  const messages = threadData?.messages ?? [];
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  function insertTemplate(text: string) {
    setDraft((prev) => (prev ? `${prev.trimEnd()} ${text}` : text));
  }

  const { segments, remaining, encoding } = countSms(draft);

  async function handleSend() {
    const text = draft.trim();
    if (!text || !toPhone || sendMutation.isPending) return;
    if (!selected) {
      toastError("No sending line available", "Configure an active phone line in Twenty CRM first.");
      return;
    }
    try {
      await sendMutation.mutateAsync({
        fromPhoneId: selected.id,
        fromNumber: selected.phoneNumber || selected.name,
        body: text,
      });
      setDraft("");
      toastInfo("Message dispatched", `Sent to ${toPhone}`);
    } catch (err: any) {
      toastError("Send failed", err?.message ?? "Could not send the message.");
    }
  }

  return (
    <div className="flex flex-col h-[520px] rounded-[10px] border border-[var(--ods-border)] bg-[var(--ods-bg-primary)] p-3">
      {/* Thread messages header */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--ods-border)]">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-[var(--ods-brand-600)]" />
          <span className="text-[13px] font-semibold text-[var(--ods-text-primary)]">Conversation</span>
        </div>
        <span className="text-[11px] text-[var(--ods-text-tertiary)] tabular-nums">{messages.length} message{messages.length === 1 ? "" : "s"}</span>
      </div>

      {/* Messages list */}
      <div ref={threadRef} className="flex-1 overflow-y-auto flex flex-col gap-2 pr-1 min-h-0">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[12px] text-[var(--ods-text-tertiary)]">Loading messages…</p>
          </div>
        ) : isError ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-1 text-center px-4">
            <MessageSquare className="w-6 h-6 text-[var(--ods-text-tertiary)] opacity-50" />
            <p className="text-[12px] text-[var(--ods-text-secondary)]">Unable to load message thread</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-1 text-center px-4">
            <MessageSquare className="w-6 h-6 text-[var(--ods-text-tertiary)] opacity-40" />
            <p className="text-[12px] text-[var(--ods-text-secondary)]">No texts exchanged yet</p>
            <p className="text-[11px] text-[var(--ods-text-tertiary)]">
              Send a text to {personName || toPhone} below.
            </p>
          </div>
        ) : (
          messages.map((m) => {
            const outbound = (m.direction || "OUTBOUND").toUpperCase() === "OUTBOUND";
            const failed = (m.status || "").toLowerCase() === "failed" || (m.status || "").toLowerCase() === "not_sent";
            return (
              <div key={m.id} className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[82%] rounded-[10px] px-3 py-2 text-[13px] ${
                    outbound
                      ? "bg-[var(--ods-brand-600)] text-white rounded-br-[2px]"
                      : "bg-[var(--ods-bg-secondary)] border border-[var(--ods-border)] text-[var(--ods-text-primary)] rounded-bl-[2px]"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <div
                    className={`text-[10px] mt-1 flex items-center gap-1.5 justify-end ${
                      outbound ? "text-white/75" : "text-[var(--ods-text-tertiary)]"
                    }`}
                  >
                    <span>{m.at ? new Date(m.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : ""}</span>
                    {outbound && statusLabel(m.status) ? <span>· {statusLabel(m.status)}</span> : null}
                    {failed ? <span className="text-red-300 font-medium">· failed</span> : null}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Composer */}
      <div className="mt-3 pt-2.5 border-t border-[var(--ods-border)]">
        {templates && templates.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap mb-2">
            {templates.map((t) => (
              <button
                key={t.label}
                type="button"
                onClick={() => insertTemplate(t.text)}
                title={`Insert: ${t.text}`}
                className="text-[11px] px-2 py-0.5 rounded-full border border-[var(--ods-border)] text-[var(--ods-text-secondary)] hover:text-[var(--ods-text-primary)] hover:border-[var(--ods-brand-500)] bg-[var(--ods-bg-secondary)]"
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
            title="Sending line"
            className="max-w-[140px] px-2 py-1.5 text-[12px] border border-[var(--ods-border)] rounded-[8px] bg-[var(--ods-bg-primary)] text-[var(--ods-text-primary)] outline-none focus:border-[var(--ods-brand-500)] cursor-pointer truncate"
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
            placeholder={`Text ${toPhone || "recipient"}…`}
            maxLength={1600}
            className="flex-1 min-w-0 px-3 py-1.5 text-[13px] border border-[var(--ods-border)] rounded-[8px] bg-[var(--ods-bg-primary)] text-[var(--ods-text-primary)] placeholder:text-[var(--ods-text-tertiary)] outline-none focus:border-[var(--ods-brand-500)]"
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!draft.trim() || sendMutation.isPending}
            title="Send Text"
            aria-label="Send Text"
            className="p-2 rounded-[8px] bg-[var(--ods-brand-600)] text-white hover:bg-[var(--ods-brand-700)] disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center justify-between text-[10px] text-[var(--ods-text-tertiary)] mt-1.5">
          <span>{selected ? `From: ${selected.phoneNumber || selected.name}` : "No lines configured"}</span>
          <span>{draft.length ? `${segments} seg (${remaining} left) · ${encoding}` : "0/1600"}</span>
        </div>
      </div>
    </div>
  );
}
