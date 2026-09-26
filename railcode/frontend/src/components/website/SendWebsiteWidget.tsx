import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Globe, Video, Copy, ExternalLink, MessageSquare, AlertTriangle, Check, Ban } from "lucide-react";
import { api } from "@/lib/apiClient";
import { WidgetCard } from "@/components/ui/WidgetCard";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Spokes } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";

interface ProspectLite {
  id: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  website?: string;
  country?: string;
}

interface AgencyPhoneRow {
  id: string;
  phoneNumber: string;
  name?: string;
  countryCode?: string | null;
  numberType?: string | null;
  state?: string | null;
  messagingProfileId?: string | null;
  // back-compat aliases from backend
  provider?: string;
  country?: string;
  status?: string;
}

interface SendWebsiteWidgetProps {
  prospect: ProspectLite;
  fromNumber?: string;
  onFromChange?: (phoneNumber: string) => void;
}

function inferProspectCountry(phone?: string, countryText?: string): "IE" | "US" | null {
  const digits = (phone || "").replace(/[^\d+]/g, "");
  if (digits.startsWith("+353")) return "IE";
  if (digits.startsWith("+1")) return "US";
  const c = (countryText || "").toLowerCase();
  if (c.includes("ireland") || c === "ie") return "IE";
  if (c.includes("united states") || c === "us" || c === "usa") return "US";
  return null;
}

function phoneCountry(row: AgencyPhoneRow): string | null {
  if (row.countryCode) return row.countryCode.toUpperCase();
  const c = (row.country || "").toUpperCase();
  if (c === "IE" || c === "IRL" || c.includes("IRELAND")) return "IE";
  if (c === "US" || c === "USA" || c.includes("UNITED STATES")) return "US";
  return null;
}

function isActiveRow(row: AgencyPhoneRow): boolean {
  if (row.state) return row.state === "ACTIVE";
  if (row.status) return row.status.toLowerCase() === "active";
  return true;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

export function SendWebsiteWidget({ prospect, fromNumber, onFromChange }: SendWebsiteWidgetProps) {
  const queryClient = useQueryClient();
  const { success, error: toastError } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [messageInit, setMessageInit] = useState(false);
  const [sentAt, setSentAt] = useState<string | null>(null);

  const { data: status, isLoading } = useQuery({
    queryKey: ["prospect-website-status", prospect.id],
    queryFn: () => api.prospects.websiteStatus(prospect.id),
    staleTime: 30_000,
  });

  const { data: phones } = useQuery<AgencyPhoneRow[]>({
    queryKey: ["twentyPhones"],
    queryFn: () => api.twentyPhones.list(),
    staleTime: Infinity,
  });

  const activePhones = useMemo(() => (phones || []).filter(isActiveRow), [phones]);

  const inferred = useMemo(
    () => inferProspectCountry(status?.prospect.phone ?? prospect.phone, status?.prospect.country ?? prospect.country),
    [status, prospect.phone, prospect.country],
  );

  // Default From-number: match prospect country, else first active
  useEffect(() => {
    if (selectedId || activePhones.length === 0) return;
    const match = inferred ? activePhones.find((p) => phoneCountry(p) === inferred) : undefined;
    setSelectedId((match ?? activePhones[0])!.id);
  }, [activePhones, inferred, selectedId]);

  const selected = useMemo(
    () => activePhones.find((p) => p.id === selectedId) ?? null,
    [activePhones, selectedId],
  );

  useEffect(() => {
    if (selected && selected.phoneNumber !== fromNumber) onFromChange?.(selected.phoneNumber);
  }, [selected, fromNumber, onFromChange]);

  const selectedCountry = selected ? phoneCountry(selected) : null;
  const mismatch = Boolean(inferred && selectedCountry && inferred !== selectedCountry);

  // Editable composer prefill — single SMS, no person name (agencyProspects.name
  // is the business, not a contact), absolute URLs only, GSM-7 chars only.
  // Links come from the server (campaign-row routing); nothing invented here.
  useEffect(() => {
    if (messageInit || !status) return;
    const offerUrl = status.urls.funnelSrc;
    if (status.offer && status.urls.templateUrl && offerUrl) {
      setMessage(
        `Here's the website we built out for you: ${status.urls.templateUrl} - have a look, then here's the offer path: ${offerUrl}`,
      );
    } else if (offerUrl) {
      setMessage(
        `We made a video on how we made it and how we could help you out: ${offerUrl} - have a look`,
      );
    } else {
      setMessage(
        `Industry not configured for this prospect yet — link an industry campaign first, then the links appear here.`,
      );
    }
    setMessageInit(true);
  }, [messageInit, status]);

  const offerVideoUrl = status?.offer?.videoUrl?.primaryLinkUrl || "";
  const prospectVideoUrl =
    typeof status?.prospect.videoUrl === "string"
      ? (status.prospect.videoUrl as string)
      : status?.prospect.videoUrl?.primaryLinkUrl || "";
  const videoUrl = offerVideoUrl || prospectVideoUrl;
  const videoStatus = status?.prospect.videoStatus || "NONE";
  const videoError = status?.prospect.videoError || "";

  const logSent = useMutation({
    mutationFn: (data: { templateUrl?: string; offerUrl?: string; fromNumber?: string; body?: string }) =>
      api.prospects.logWebsiteSent(prospect.id, data),
    onSuccess: (res) => {
      setSentAt(res.sentAt);
      queryClient.invalidateQueries({ queryKey: ["prospect-website-status", prospect.id] });
      queryClient.invalidateQueries({ queryKey: ["prospect", prospect.id] });
      success("Logged as sent", "Prospect asked to have a look — now send them down the offer path");
    },
    onError: () => toastError("Error", "Failed to log website sent"),
  });

  const ensureOffer = useMutation({
    mutationFn: () => api.prospects.ensureOffer(prospect.id),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["prospect-website-status", prospect.id] });
      success(
        res.action === "created" ? "Industry offer created" : "Industry offer exists",
        res.action === "created"
          ? `INDUSTRY:${res.industryKey} is live — links now work`
          : `Using INDUSTRY:${res.industryKey}`,
      );
    },
    onError: () => toastError("Error", "Failed to ensure industry offer"),
  });

  async function handleCopy(text: string, label: string) {
    const ok = await copyText(text);
    if (ok) success("Copied", label);
    else toastError("Error", "Copy failed — select the text manually");
  }

  const smsPhone = status?.prospect.phoneE164 || status?.prospect.phone || prospect.phone;
  const smsHref =
    smsPhone && message
      ? `sms:${smsPhone}?body=${encodeURIComponent(message)}`
      : null;

  const expectedPipelineCmd = status
    ? `run.py --start-url ${status.prospect.website || prospect.website || "<website>"} --generated-url ${status.urls.templateUrl || "<industry not configured>"} --pack-dir ${status.urls.pack || "<unconfigured>"} → Cap + cursor.json → ffmpeg → R2 → patch videoUrl + videoStatus`
    : "video-agent pipeline (loads once prospect data arrives)";

  return (
    <WidgetCard
      title="Send Website"
      icon={Globe}
      action={
        videoStatus === "ATTACHED" ? (
          <Badge variant="green">Video ready</Badge>
        ) : videoStatus === "FAILED" ? (
          <Badge variant="rose">Video failed</Badge>
        ) : (
          <Badge variant="gray">{videoStatus}</Badge>
        )
      }
    >
      {isLoading || !status ? (
        <div className="flex items-center justify-center h-40">
          <Spokes className="w-5 h-5 text-[var(--ods-brand-600)]" />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* From-number selector */}
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-tertiary)] mb-2">
              Send from (agencyPhones)
            </dt>
            {activePhones.length === 0 ? (
              <div className="flex items-start gap-2 p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-[6px] text-[12px] text-amber-700">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  No sending numbers — add 1×IE + 1×US rows in Twenty → agencyPhones
                  (phoneNumber, countryCode, state=ACTIVE, messagingProfileId). Day-1 still works via manual SMS draft.
                </span>
              </div>
            ) : (
              <select
                value={selectedId ?? ""}
                onChange={(e) => setSelectedId(e.target.value)}
                className="w-full px-3 py-1.5 text-[12px] border border-[var(--ods-border)] rounded-[4px] bg-[var(--ods-bg-primary)] text-[var(--ods-text-primary)] outline-none focus:border-[var(--ods-brand-500)] cursor-pointer"
              >
                {activePhones.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.phoneNumber} ({phoneCountry(p) || "?"} · {p.numberType || p.provider || "?"})
                  </option>
                ))}
              </select>
            )}
            {mismatch && selected && (
              <div className="flex items-start gap-2 mt-2 p-2.5 bg-red-500/10 border border-red-500/20 rounded-[6px] text-[12px] text-red-600">
                <Ban className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  {selectedCountry} number selected for {inferred} prospect — sending a US number to Ireland
                  hurts deliverability/trust. Pick a {inferred} number or override explicitly.
                </span>
              </div>
            )}
            {inferred && selectedCountry && !mismatch && (
              <p className="text-[11px] text-[var(--ods-text-tertiary)] mt-1.5">
                {selectedCountry} → {inferred} ✓ matched
              </p>
            )}
          </div>

          {/* Industry / niche */}
          <div className="flex items-center gap-2 flex-wrap">
            {status.prospect.labelValue && <Badge variant="indigo">{status.prospect.labelValue}</Badge>}
            {status.prospect.niche && (
              <span className="text-[12px] text-[var(--ods-text-secondary)]">{status.prospect.niche}</span>
            )}
            {status.prospect.slug && (
              <span className="text-[11px] text-[var(--ods-text-tertiary)] font-mono">{status.prospect.slug}</span>
            )}
          </div>

          {/* Video status */}
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-tertiary)] mb-2">
              <span className="inline-flex items-center gap-1.5"><Video className="w-3.5 h-3.5" /> Video page</span>
            </dt>
            {videoError && <p className="text-[12px] text-red-600 mb-1.5">{videoError}</p>}
            {videoUrl ? (
              <div className="flex flex-col gap-1.5">
                {offerVideoUrl && (
                  <div className="flex items-center gap-2 text-[12px]">
                    <Badge variant="blue">Offer</Badge>
                    <a href={offerVideoUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--ods-brand-600)] hover:underline truncate flex-1">
                      {offerVideoUrl}
                    </a>
                    <button onClick={() => handleCopy(offerVideoUrl, "Offer video URL copied")} className="p-1 hover:bg-[var(--ods-bg-secondary)] rounded" title="Copy offer video URL">
                      <Copy className="w-3.5 h-3.5 text-[var(--ods-text-tertiary)]" />
                    </button>
                  </div>
                )}
                {prospectVideoUrl && prospectVideoUrl !== offerVideoUrl && (
                  <div className="flex items-center gap-2 text-[12px]">
                    <Badge variant="gray">Prospect</Badge>
                    <a href={prospectVideoUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--ods-brand-600)] hover:underline truncate flex-1">
                      {prospectVideoUrl}
                    </a>
                    <button onClick={() => handleCopy(prospectVideoUrl, "Prospect video URL copied")} className="p-1 hover:bg-[var(--ods-bg-secondary)] rounded" title="Copy prospect video URL">
                      <Copy className="w-3.5 h-3.5 text-[var(--ods-text-tertiary)]" />
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[12px] text-[var(--ods-text-tertiary)]">No video yet — status {videoStatus}</p>
            )}
          </div>

          {/* Two pages */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="p-2.5 bg-[var(--ods-bg-primary)] border border-[var(--ods-border)] rounded-[6px]">
              <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-tertiary)] mb-1">A · Website we built</p>
              {status.urls.templateUrl ? (
                <>
                  <p className="text-[12px] font-mono text-[var(--ods-text-secondary)] truncate mb-2">{status.urls.templateUrl}</p>
                  <div className="flex gap-1.5">
                    <Button variant="secondary" size="sm" onClick={() => handleCopy(status.urls.templateUrl as string, "Website link copied")}>
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                    <a href={status.urls.templateUrl} target="_blank" rel="noopener noreferrer">
                      <Button variant="secondary" size="sm">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Button>
                    </a>
                  </div>
                </>
              ) : (
                <p className="text-[12px] text-[var(--ods-text-tertiary)]">Industry not configured for this prospect — link an industry campaign first.</p>
              )}
            </div>
            <div className="p-2.5 bg-[var(--ods-bg-primary)] border border-[var(--ods-border)] rounded-[6px]">
              <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-tertiary)] mb-1">B · Offer funnel</p>
              {status.offer && status.urls.funnelSrc ? (
                <>
                  <p className="text-[12px] font-mono text-[var(--ods-text-secondary)] truncate mb-2">{status.urls.funnelSrc}</p>
                  <div className="flex gap-1.5">
                    <Button variant="secondary" size="sm" onClick={() => handleCopy(status.urls.funnelSrc as string, "Offer link copied")}>
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                    <a href={status.urls.funnelSrc} target="_blank" rel="noopener noreferrer">
                      <Button variant="secondary" size="sm">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Button>
                    </a>
                  </div>
                </>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-[12px] text-[var(--ods-text-tertiary)]">
                    {status.urls.industryKey
                      ? `No INDUSTRY:${status.urls.industryKey} offer yet.`
                      : `Industry not configured for this prospect — link an industry campaign first.`}
                  </p>
                  {status.urls.industryKey && (
                    <Button
                      variant="primary"
                      size="sm"
                      isLoading={ensureOffer.isPending}
                      onClick={() => ensureOffer.mutate()}
                    >
                      Create industry offer
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Video-agent placeholder (blocked, visible) */}
          <div className="p-2.5 border border-dashed border-[var(--ods-border)] rounded-[6px]">
            <div className="flex items-center gap-2 mb-1.5">
              <Button variant="secondary" size="sm" disabled title="Video-agent pipeline is not runnable yet — see expected behavior below">
                Generate walkthrough (coming soon)
              </Button>
            </div>
            <p className="text-[11px] font-mono text-[var(--ods-text-tertiary)] break-all">{expectedPipelineCmd}</p>
          </div>

          {/* Message composer */}
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-tertiary)] mb-2">
              <span className="inline-flex items-center gap-1.5"><MessageSquare className="w-3.5 h-3.5" /> Message (editable)</span>
            </dt>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-[var(--ods-border)] rounded-[6px] text-[13px] bg-[var(--ods-bg-primary)] text-[var(--ods-text-primary)] resize-y"
              placeholder="Message to send with the website links…"
            />
            {sentAt ? (
              <div className="flex items-start gap-2 mt-2 p-2.5 bg-green-500/10 border border-green-500/20 rounded-[6px] text-[12px] text-green-700">
                <Check className="w-4 h-4 shrink-0 mt-0.5" />
                <span>Sent ✓ — asked them to have a look ({new Date(sentAt).toLocaleString()}). Next: send them down the offer path.</span>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2 mt-2">
              <Button variant="secondary" size="sm" onClick={() => handleCopy(message, "Message copied")}>
                <Copy className="w-3.5 h-3.5" /> Copy
              </Button>
              {smsHref && (
                <a href={smsHref}>
                  <Button variant="secondary" size="sm">
                    <MessageSquare className="w-3.5 h-3.5" /> SMS draft
                  </Button>
                </a>
              )}
              <Button
                variant="primary"
                size="sm"
                isLoading={logSent.isPending}
                onClick={() =>
                  logSent.mutate({
                    templateUrl: status.urls.templateUrl ?? undefined,
                    offerUrl: status.urls.funnelSrc,
                    fromNumber: selected?.phoneNumber,
                    body: message,
                  })
                }
              >
                Log sent ✓
              </Button>
            </div>
          </div>
        </div>
      )}
    </WidgetCard>
  );
}
