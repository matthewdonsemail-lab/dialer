import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { checkSmsRoute, onPageSent, outreachMachine, regionName, regionOfCountry, regionOfNumber, videoMachine } from "@dialer/shared";
import { Check, ChevronDown, Copy, ExternalLink, Eye, Globe, MessageSquare, Phone, Play, Sparkles, Video } from "@/components/ui/icons";
import { SelectMenu } from "@/components/ui/Menu";
import { useToast } from "@/components/ui/Toast";
import { CountryFlag } from "@/components/common/CountryBadge";
import { useAuth } from "@/components/auth/AuthProvider";
import { api } from "@/lib/api-client";
import { countSms } from "@/lib/sms";
import { humanizeCode } from "@/domains/activity";
import { Button, Notice, Pill, Section, SectionRow, StatePill, buttonClass, textareaClass } from "@/primitives";

/*
 * The prospect's page and sending it. One page per prospect on the offer
 * site (site we built + video + booking quiz), so there is one link. The
 * outreach rules come from @dialer/shared, the same code the backend
 * enforces: an opted-out prospect gets nothing and a number only texts its
 * own country.
 */

interface PhoneRow {
  id: string;
  phoneNumber: string;
  countryCode?: string | null;
  state?: string | null;
  status?: string;
  callState?: string | null;
  claimedByMemberId?: string | null;
}

function shortUrl(href: string): string {
  try {
    const u = new URL(href);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname === "/" ? "" : u.pathname}`;
  } catch {
    return href;
  }
}

/** ISO country for a flag, from a stored code or the number itself. */
function flagCode(row: PhoneRow): string | null {
  if (row.countryCode) return row.countryCode.toUpperCase();
  const region = regionOfNumber(row.phoneNumber);
  return region === "NANP" ? "US" : region;
}

export function WebsitePanel({ prospectId, prospectPhone, prospectCountry }: { prospectId: string; prospectPhone?: string | null; prospectCountry?: string | null }) {
  const queryClient = useQueryClient();
  const { success, error: toastError } = useToast();
  const { user } = useAuth();
  const myId = user?.memberId ?? null;

  const { data: status, isLoading, error } = useQuery({
    queryKey: ["prospect-website-status", prospectId],
    queryFn: () => api.prospects.websiteStatus(prospectId),
    staleTime: 30_000,
  });
  const { data: phones } = useQuery<PhoneRow[]>({
    queryKey: ["twentyPhones"],
    queryFn: () => api.twentyPhones.list(),
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  const toNumber = status?.prospect.phoneE164 || status?.prospect.phone || prospectPhone || "";
  const toCountry = status?.prospect.country || prospectCountry || "";
  const toRegion = regionOfNumber(toNumber) ?? regionOfCountry(toCountry);

  // Sending numbers: active and not on someone else's call; same-country first.
  const free = useMemo(() => {
    const rows = (phones ?? [])
      .filter((p) => (p.state ? p.state === "ACTIVE" : !p.status || p.status.toLowerCase() === "active"))
      .filter((p) => (p.callState || "IDLE") === "IDLE" || !p.claimedByMemberId || p.claimedByMemberId === myId);
    return [...rows].sort((a, b) => Number(regionOfNumber(b.phoneNumber) === toRegion) - Number(regionOfNumber(a.phoneNumber) === toRegion));
  }, [phones, myId, toRegion]);
  const [fromId, setFromId] = useState<string | null>(null);
  useEffect(() => {
    if (fromId && free.some((p) => p.id === fromId)) return;
    setFromId(free[0]?.id ?? null);
  }, [free, fromId]);
  const from = free.find((p) => p.id === fromId) ?? null;
  const route = from ? checkSmsRoute({ number: from.phoneNumber }, { number: toNumber, country: toCountry }) : null;
  const matching = route && !route.ok ? free.find((p) => regionOfNumber(p.phoneNumber) === route.to) : undefined;

  // Prefilled once with the one page link (never invented here).
  const [message, setMessage] = useState("");
  const [prefilled, setPrefilled] = useState(false);
  useEffect(() => {
    if (prefilled || !status) return;
    setMessage(`Hi, we built a new website for your business and made a short video showing it: ${status.page.url} - have a look and let me know what you think`);
    setPrefilled(true);
  }, [prefilled, status]);
  const sms = countSms(message);
  const [sentAt, setSentAt] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(true);

  const copy = async (value: string, what: string) => {
    try {
      await navigator.clipboard.writeText(value);
      success("Copied", what);
    } catch {
      toastError("Copy failed", "Select the text and copy it by hand.");
    }
  };

  const logSent = useMutation({
    mutationFn: () => api.prospects.logWebsiteSent(prospectId, { offerUrl: status?.page.url, fromNumber: from?.phoneNumber, body: message }),
    onSuccess: (res) => {
      setSentAt(res.sentAt);
      ["prospect-website-status", "prospect", "record-activity"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
      success("Marked as sent", "Outreach moved to Message sent.");
    },
    onError: (err) => toastError("Not marked as sent", err instanceof Error ? err.message : "Try again."),
  });

  const ensureOffer = useMutation({
    mutationFn: () => api.prospects.ensureOffer(prospectId),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["prospect-website-status", prospectId] });
      success(res.action === "created" ? "Industry copy created" : "Industry copy found", `Edit it in Twenty under agencyOffers (INDUSTRY:${res.industryKey}).`);
    },
    onError: (err) => toastError("Not created", err instanceof Error ? err.message : "Try again."),
  });

  if (isLoading) return <PanelSkeleton />;
  if (error || !status) {
    return (
      <div className="p-3">
        <Notice tone="negative" title="Website details could not be loaded">
          {error instanceof Error ? error.message : "Try again."}
        </Notice>
      </div>
    );
  }

  const p = status.prospect;
  const video = (typeof p.videoUrl === "string" ? (p.videoUrl as string) : p.videoUrl?.primaryLinkUrl) || status.offer?.videoUrl?.primaryLinkUrl || "";
  const industry = p.labelValue && p.labelValue !== "UNLABELED" ? humanizeCode(p.labelValue) : p.niche || null;
  const outreach = onPageSent(p.outboundLabel);
  const canSend = !!message.trim() && !!from && !!route?.ok && outreach.ok;
  const smsHref = canSend && toNumber ? `sms:${toNumber}?body=${encodeURIComponent(message)}` : null;

  return (
    <div className="p-3 space-y-3">
      {/* where this prospect is: outreach stage, video, industry */}
      <div className="flex flex-wrap items-center gap-1.5">
        <StatePill machine={outreachMachine} value={p.outboundLabel} />
        <StatePill machine={videoMachine} value={p.videoStatus} />
        {industry && <Pill icon={Globe}>{industry}</Pill>}
      </div>

      <Section
        title="Their page"
        icon={Globe}
        tip={{
          title: "Their page",
          icon: Globe,
          what: "One page per prospect on the offer site: the website we built, the walkthrough video and the booking quiz.",
          use: "This is the only link to send. It works before any industry copy is set up; that copy only changes the headline and quiz.",
        }}
        action={<Button variant="ghost" size="sm" icon={Eye} onClick={() => setShowPreview(!showPreview)}>{showPreview ? "Hide" : "Preview"}</Button>}
      >
        {showPreview && (
          <SectionRow className="!p-0">
            {status.page.previewAllowed ? (
              <div className="relative w-full aspect-[4/3] overflow-hidden bg-[var(--ods-bg-secondary)]">
                {/* rendered at desktop width and scaled down, so it looks like the real page */}
                <iframe
                  title="Prospect page preview"
                  src={status.page.url}
                  loading="lazy"
                  sandbox="allow-scripts allow-same-origin"
                  className="absolute top-0 left-0 origin-top-left border-0 pointer-events-none"
                  style={{ width: "400%", height: "400%", transform: "scale(0.25)" }}
                />
              </div>
            ) : (
              <div className="p-3">
                <Notice tone="warning" title="Preview not available">
                  {status.page.previewBlockedReason} To show it here, add this app&apos;s address to the offer site&apos;s frame-ancestors.
                </Notice>
              </div>
            )}
          </SectionRow>
        )}
        <SectionRow className="flex items-center gap-2.5">
          <span className="w-8 h-8 shrink-0 rounded-md bg-[var(--ods-bg-tertiary)] flex items-center justify-center text-[var(--ods-brand-600)]">
            <Globe className="w-3.5 h-3.5" aria-hidden="true" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold">Prospect page</div>
            <div className="text-[12px] text-[var(--ods-text-tertiary)] truncate" title={status.page.url}>
              {shortUrl(status.page.url)}
            </div>
          </div>
          <Button variant="ghost" size="sm" icon={Copy} aria-label="Copy the page link" title="Copy the page link" onClick={() => void copy(status.page.url, "Page link")} />
          <a href={status.page.url} target="_blank" rel="noreferrer" title="Open the page" aria-label="Open the page" className={buttonClass({ variant: "ghost", size: "sm", iconOnly: true })}>
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
          </a>
        </SectionRow>
        <SectionRow className="flex items-center gap-2.5">
          <span className="w-8 h-8 shrink-0 rounded-md bg-[var(--ods-bg-tertiary)] flex items-center justify-center text-[var(--ods-text-secondary)]">
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold">Industry copy</div>
            <div className="text-[12px] text-[var(--ods-text-tertiary)] truncate">
              {status.offer ? status.offer.heroH1 || status.offer.title || "Custom" : industry ? `Default headline and quiz for ${industry}` : "Set an industry first"}
            </div>
          </div>
          {status.offer ? (
            <Pill tone="positive">Custom</Pill>
          ) : status.urls.industryKey ? (
            <Button size="sm" busy={ensureOffer.isPending} busyLabel="Creating…" onClick={() => ensureOffer.mutate()}>
              Customise
            </Button>
          ) : (
            <Pill tone="neutral">Default</Pill>
          )}
        </SectionRow>
      </Section>

      <Section
        title="Video"
        icon={Video}
        tip={{
          title: "Walkthrough video",
          icon: Video,
          what: "A screen recording of their current site, then the one we built, shown on their page.",
          formula: ["Their site", "→", "Our site", "→", "Recording", "→", "Their page"],
          use: p.videoError ? `Last attempt failed: ${p.videoError}` : "Recording from the dialer is coming soon.",
        }}
      >
        <SectionRow className="flex items-center gap-2.5">
          {video ? (
            <a href={video} target="_blank" rel="noreferrer" title="Watch the video" className="w-16 h-10 shrink-0 rounded-md bg-[var(--ods-brand-600)]/15 text-[var(--ods-brand-600)] flex items-center justify-center hover:bg-[var(--ods-brand-600)]/25">
              <Play className="w-4 h-4" aria-hidden="true" />
            </a>
          ) : (
            <span className="w-16 h-10 shrink-0 rounded-md border border-dashed border-[var(--ods-border-strong)] flex items-center justify-center text-[var(--ods-text-tertiary)]">
              <Video className="w-4 h-4" aria-hidden="true" />
            </span>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold">{videoMachine.label(videoMachine.parse(p.videoStatus))}</div>
            <div className="text-[12px] text-[var(--ods-text-tertiary)] truncate" title={video || undefined}>
              {video ? shortUrl(video) : videoMachine.def(videoMachine.parse(p.videoStatus) ?? "NONE").description}
            </div>
          </div>
          {video && <Button variant="ghost" size="sm" icon={Copy} aria-label="Copy the video link" title="Copy the video link" onClick={() => void copy(video, "Video link")} />}
        </SectionRow>
      </Section>

      <Section title="Send it" icon={MessageSquare} padded>
        <div className="space-y-3">
          <div>
            <div className="text-[12px] font-semibold text-[var(--ods-text-secondary)] mb-1">From</div>
            {free.length === 0 ? (
              <Notice tone="warning">No free number to send from. Add or free one up on the Phone Numbers page.</Notice>
            ) : (
              <SelectMenu
                value={fromId}
                onChange={setFromId}
                width={280}
                sections={[
                  {
                    title: toRegion ? `Texting a ${regionName(toRegion)} number` : "Your numbers",
                    options: free.map((n) => {
                      const ok = checkSmsRoute({ number: n.phoneNumber }, { number: toNumber, country: toCountry }).ok;
                      return {
                        value: n.id,
                        label: n.phoneNumber,
                        icon: <CountryFlag code={flagCode(n)} />,
                        disabled: !ok,
                        description: ok ? undefined : "Different country: carriers block this route.",
                      };
                    }),
                  },
                ]}
                triggerClassName="w-full h-9 px-3 rounded-[8px] border border-[var(--ods-border-strong)] bg-[var(--ods-bg-primary)] hover:bg-[var(--ods-hover)] text-[14px] font-semibold inline-flex items-center gap-2 tabular-nums"
                trigger={
                  <>
                    {from && <CountryFlag code={flagCode(from)} />}
                    <span className="flex-1 text-left truncate">{from?.phoneNumber ?? "Choose a number"}</span>
                    <ChevronDown className="w-3 h-3 opacity-60" aria-hidden="true" />
                  </>
                }
              />
            )}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-semibold text-[var(--ods-text-secondary)]">To</span>
            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold tabular-nums">
              {toRegion && <CountryFlag code={toRegion === "NANP" ? "US" : toRegion} />}
              {toNumber || "No number"}
            </span>
          </div>

          {route && !route.ok && (
            <Notice tone="negative" title="This number cannot text them">
              {route.reason}
              {matching && (
                <span className="block mt-2">
                  <Button size="sm" onClick={() => setFromId(matching.id)}>
                    Use {matching.phoneNumber}
                  </Button>
                </span>
              )}
            </Notice>
          )}
          {route?.ok && route.warning && <Notice tone="warning">{route.warning}</Notice>}
          {!outreach.ok && <Notice tone="negative" title="Sending is blocked">{outreach.reason}</Notice>}

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[12px] font-semibold text-[var(--ods-text-secondary)]">Message</span>
              <Pill tone={sms.segments > 1 ? "warning" : "neutral"}>
                {sms.units} chars · {sms.segments} {sms.segments === 1 ? "segment" : "segments"}
              </Pill>
            </div>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5} aria-label="Message" className={`${textareaClass} resize-y`} />
          </div>

          {sentAt && (
            <Notice tone="positive">Marked as sent {new Date(sentAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}. Outreach is now Message sent.</Notice>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button icon={Copy} disabled={!message} onClick={() => void copy(message, "Message")}>
              Copy
            </Button>
            {smsHref ? (
              <a href={smsHref} title="Open the message in your phone's SMS app" className={buttonClass({ variant: "secondary" })}>
                <Phone className="w-3.5 h-3.5" aria-hidden="true" /> Phone SMS
              </a>
            ) : (
              <Button icon={Phone} disabled title="Fix the issue above first">
                Phone SMS
              </Button>
            )}
          </div>
          <Button variant="primary" block icon={Check} disabled={!canSend} busy={logSent.isPending} busyLabel="Saving…" onClick={() => logSent.mutate()}>
            Mark as sent
          </Button>
        </div>
      </Section>
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="p-3 space-y-3" role="status" aria-label="Loading">
      <div className="flex gap-1.5">
        {[24, 20, 28].map((w, i) => (
          <div key={i} className="h-6 rounded-md bg-[var(--ods-bg-tertiary)] animate-pulse" style={{ width: w * 4 }} />
        ))}
      </div>
      {[200, 56, 240].map((h, i) => (
        <div key={i} className="rounded-[10px] border border-[var(--ods-border)] overflow-hidden">
          <div className="h-11 px-3 flex items-center">
            <div className="h-3.5 w-24 rounded-md bg-[var(--ods-bg-tertiary)] animate-pulse" />
          </div>
          <div className="border-t border-[var(--ods-border)] p-3">
            <div className="rounded-md bg-[var(--ods-bg-tertiary)] animate-pulse" style={{ height: h }} />
          </div>
        </div>
      ))}
    </div>
  );
}
