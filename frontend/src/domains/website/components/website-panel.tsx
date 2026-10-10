import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Globe,
  MessageSquare,
  Phone,
  Play,
  Plus,
  Video,
  type IconComponent,
} from "@/components/ui/icons";
import { Chip } from "@/components/ui/Chip";
import { InfoTip, type TipSpec } from "@/components/ui/InfoTip";
import { SelectMenu } from "@/components/ui/Menu";
import { useToast } from "@/components/ui/Toast";
import { CountryFlag } from "@/components/common/CountryBadge";
import { useAuth } from "@/components/auth/AuthProvider";
import { api } from "@/lib/api-client";
import { countSms } from "@/lib/sms";
import { humanizeCode } from "@/lib/record-history";

/*
 * Website and video for one prospect, built for the contact page's right
 * panel: what was made for them (walkthrough video, the website, the offer
 * page), then the message that sends it. One column, cards in the house
 * style, plain labels, no internal names or codes.
 */

interface PhoneRow {
  id: string;
  phoneNumber: string;
  countryCode?: string | null;
  numberType?: string | null;
  state?: string | null;
  status?: string;
  country?: string;
  callState?: string | null;
  claimedByMemberId?: string | null;
  claimedByEmail?: string | null;
}

const BTN_PRIMARY =
  "h-9 px-3 rounded-[8px] bg-[var(--ods-brand-600)] hover:bg-[var(--ods-brand-700)] text-white text-[13px] font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-50";
const BTN_SECONDARY =
  "h-9 px-3 rounded-[8px] border border-[var(--ods-border-strong)] text-[13px] font-semibold text-[var(--ods-text-primary)] hover:bg-[var(--ods-hover)] inline-flex items-center justify-center gap-1.5 disabled:opacity-50";
const BTN_ICON =
  "w-8 h-8 shrink-0 rounded-[8px] border border-[var(--ods-border)] inline-flex items-center justify-center text-[var(--ods-text-secondary)] hover:text-[var(--ods-text-primary)] hover:bg-[var(--ods-hover)]";

function countryOfPhone(row: PhoneRow): string | null {
  if (row.countryCode) return row.countryCode.toUpperCase();
  const c = (row.country || "").toUpperCase();
  if (c === "IE" || c === "IRL" || c.includes("IRELAND")) return "IE";
  if (c === "US" || c === "USA" || c.includes("UNITED STATES")) return "US";
  return null;
}

function countryOfProspect(phone?: string, country?: string): string | null {
  const digits = (phone || "").replace(/[^\d+]/g, "");
  if (digits.startsWith("+353")) return "IE";
  if (digits.startsWith("+1")) return "US";
  if (digits.startsWith("+44")) return "GB";
  const c = (country || "").toLowerCase();
  if (c.includes("ireland") || c === "ie") return "IE";
  if (c.includes("united states") || c === "us" || c === "usa") return "US";
  if (c.includes("united kingdom") || c === "uk" || c === "gb") return "GB";
  return null;
}

function shortUrl(href: string): string {
  try {
    const u = new URL(href);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname === "/" ? "" : u.pathname}`;
  } catch {
    return href;
  }
}

const VIDEO_STATE: Record<string, { label: string; dot: string }> = {
  ATTACHED: { label: "Video ready", dot: "bg-emerald-500" },
  READY: { label: "Video ready", dot: "bg-emerald-500" },
  FAILED: { label: "Video failed", dot: "bg-red-500" },
  NONE: { label: "No video yet", dot: "bg-gray-400" },
};
const videoState = (s: string) => VIDEO_STATE[s] ?? { label: humanizeCode(s), dot: "bg-sky-500" };

function Card({ title, icon: Icon, tip, action, children }: { title: string; icon: IconComponent; tip?: TipSpec; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-[10px] border border-[var(--ods-border)] bg-[var(--ods-bg-primary)]">
      <header className="h-11 px-3 flex items-center justify-between gap-2 border-b border-[var(--ods-border)]">
        <span className="flex items-center gap-2 min-w-0">
          <Icon className="w-3.5 h-3.5 shrink-0 text-[var(--ods-text-tertiary)]" />
          <span className="text-[14px] font-semibold truncate">{title}</span>
          {tip && <InfoTip tip={tip} />}
        </span>
        {action}
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}

/** A link we made for them: what it is, where it points, copy and open. */
function LinkRow({ icon: Icon, title, href, onCopy }: { icon: IconComponent; title: string; href: string; onCopy: () => void }) {
  return (
    <div className="flex items-center gap-2.5 py-2 first:pt-0 last:pb-0">
      <span className="w-8 h-8 shrink-0 rounded-md bg-[var(--ods-bg-tertiary)] flex items-center justify-center text-[var(--ods-brand-600)]">
        <Icon className="w-3.5 h-3.5" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold">{title}</div>
        <a href={href} target="_blank" rel="noreferrer" title={href} className="block text-[12px] text-[var(--ods-brand-600)] hover:underline truncate">
          {shortUrl(href)}
        </a>
      </div>
      <button onClick={onCopy} title={`Copy the ${title.toLowerCase()} link`} className={BTN_ICON}>
        <Copy className="w-3.5 h-3.5" />
      </button>
      <a href={href} target="_blank" rel="noreferrer" title={`Open the ${title.toLowerCase()}`} className={BTN_ICON}>
        <ExternalLink className="w-3.5 h-3.5" />
      </a>
    </div>
  );
}

function Notice({ tone, children }: { tone: "amber" | "red" | "green"; children: ReactNode }) {
  const styles = {
    amber: "bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-200",
    red: "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300",
    green: "bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-200",
  }[tone];
  const Icon = tone === "green" ? Check : AlertTriangle;
  return (
    <div className={`flex items-start gap-2 p-2.5 rounded-[8px] border text-[12px] ${styles}`}>
      <Icon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
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

  // Sending numbers: active, not on someone else's call.
  const free = useMemo(
    () =>
      (phones ?? [])
        .filter((p) => (p.state ? p.state === "ACTIVE" : !p.status || p.status.toLowerCase() === "active"))
        .filter((p) => (p.callState || "IDLE") === "IDLE" || !p.claimedByMemberId || p.claimedByMemberId === myId),
    [phones, myId],
  );
  const theirCountry = countryOfProspect(status?.prospect.phoneE164 || status?.prospect.phone || prospectPhone || undefined, status?.prospect.country || prospectCountry || undefined);
  const [fromId, setFromId] = useState<string | null>(null);
  useEffect(() => {
    if (fromId && free.some((p) => p.id === fromId)) return;
    const match = theirCountry ? free.find((p) => countryOfPhone(p) === theirCountry) : undefined;
    setFromId((match ?? free[0])?.id ?? null);
  }, [free, fromId, theirCountry]);
  const from = free.find((p) => p.id === fromId) ?? null;
  const fromCountry = from ? countryOfPhone(from) : null;
  const mismatch = !!(theirCountry && fromCountry && theirCountry !== fromCountry);

  // The message, prefilled once from the server's links (never invented here).
  const [message, setMessage] = useState("");
  const [prefilled, setPrefilled] = useState(false);
  useEffect(() => {
    if (prefilled || !status) return;
    // Only links that exist: the offer page needs an offer row first.
    const offer = status.offer ? status.urls.funnelSrc : "";
    const site = status.urls.templateUrl ?? "";
    if (site && offer) {
      setMessage(`Here's the website we built for you: ${site} - have a look, then here's how we'd get you more customers: ${offer}`);
    } else if (offer) {
      setMessage(`We made a short video on how we built it and how we could help you: ${offer} - have a look`);
    } else if (site) {
      setMessage(`Here's the website we built for you: ${site} - have a look and let me know what you think`);
    }
    setPrefilled(true);
  }, [prefilled, status]);
  const sms = countSms(message);
  const [sentAt, setSentAt] = useState<string | null>(null);

  const copy = async (value: string, what: string) => {
    try {
      await navigator.clipboard.writeText(value);
      success("Copied", what);
    } catch {
      toastError("Copy failed", "Select the text and copy it by hand.");
    }
  };

  const logSent = useMutation({
    mutationFn: () =>
      api.prospects.logWebsiteSent(prospectId, {
        templateUrl: status?.urls.templateUrl ?? undefined,
        offerUrl: status?.offer ? status.urls.funnelSrc : undefined,
        fromNumber: from?.phoneNumber,
        body: message,
      }),
    onSuccess: (res) => {
      setSentAt(res.sentAt);
      queryClient.invalidateQueries({ queryKey: ["prospect-website-status", prospectId] });
      queryClient.invalidateQueries({ queryKey: ["prospect", prospectId] });
      queryClient.invalidateQueries({ queryKey: ["record-activity", "prospect", prospectId] });
      success("Marked as sent", "Next: follow up on the offer page.");
    },
    onError: () => toastError("Not saved", "Could not mark the website as sent."),
  });

  const ensureOffer = useMutation({
    mutationFn: () => api.prospects.ensureOffer(prospectId),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["prospect-website-status", prospectId] });
      success(res.action === "created" ? "Offer page created" : "Offer page found", `${humanizeCode(res.industryKey.toUpperCase())} is ready to share.`);
    },
    onError: () => toastError("Not created", "The offer page could not be created."),
  });

  if (isLoading) return <PanelSkeleton />;
  if (error || !status) {
    return (
      <div className="p-3">
        <Notice tone="red">Website details could not be loaded{error ? `: ${(error as Error).message}` : ""}.</Notice>
      </div>
    );
  }

  const p = status.prospect;
  const offerVideo = status.offer?.videoUrl?.primaryLinkUrl || "";
  const ownVideo = typeof p.videoUrl === "string" ? (p.videoUrl as string) : p.videoUrl?.primaryLinkUrl || "";
  const video = ownVideo || offerVideo;
  const vState = videoState((p.videoStatus || "NONE").toUpperCase());
  const industry = p.labelValue ? humanizeCode(p.labelValue) : p.niche || null;
  const smsHref = (p.phoneE164 || p.phone) && message ? `sms:${p.phoneE164 || p.phone}?body=${encodeURIComponent(message)}` : null;
  const howVideoIsMade: TipSpec = {
    title: "How the video is made",
    icon: Video,
    what: "A screen recording walks through their current site, then the site we built, and is uploaded to their offer page.",
    formula: ["Their site", "→", "Our site", "→", "Recording", "→", "Offer page"],
    use: p.videoError ? `Last attempt failed: ${p.videoError}` : "Generating it from here is coming soon.",
  };

  return (
    <div className="p-3 space-y-3">
      {/* where things stand */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip dot={vState.dot}>{vState.label}</Chip>
        {industry && <Chip icon={Globe}>{industry}</Chip>}
        {p.outboundLabel && <Chip dot="bg-sky-500">{humanizeCode(p.outboundLabel)}</Chip>}
      </div>

      <Card title="Video" icon={Video} tip={howVideoIsMade}>
        {video ? (
          <div className="flex items-center gap-2.5">
            <a
              href={video}
              target="_blank"
              rel="noreferrer"
              className="w-16 h-10 shrink-0 rounded-md bg-[var(--ods-brand-600)]/15 text-[var(--ods-brand-600)] flex items-center justify-center hover:bg-[var(--ods-brand-600)]/25"
              title="Watch the video"
            >
              <Play className="w-4 h-4" />
            </a>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold">{ownVideo ? "Walkthrough for this business" : "Industry walkthrough"}</div>
              <div className="text-[12px] text-[var(--ods-text-tertiary)] truncate" title={video}>
                {shortUrl(video)}
              </div>
            </div>
            <button onClick={() => void copy(video, "Video link")} title="Copy the video link" className={BTN_ICON}>
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <span className="w-16 h-10 shrink-0 rounded-md border border-dashed border-[var(--ods-border-strong)] flex items-center justify-center text-[var(--ods-text-tertiary)]">
              <Video className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold">No video yet</div>
              <div className="text-[12px] text-[var(--ods-text-tertiary)]">{p.videoError ? "The last recording failed." : "Recording from here is coming soon."}</div>
            </div>
          </div>
        )}
      </Card>

      <Card title="Links" icon={Globe} tip={{ title: "Links", icon: Globe, what: "The website we built for them and the offer page that explains what we would do next.", use: "Copy a link into any message, or open it to check it first." }}>
        <div className="divide-y divide-[var(--ods-border)]">
          {status.urls.templateUrl ? (
            <LinkRow icon={Globe} title="Website we built" href={status.urls.templateUrl} onCopy={() => void copy(status.urls.templateUrl as string, "Website link")} />
          ) : (
            <p className="pb-2 text-[12px] text-[var(--ods-text-tertiary)]">No website yet: this business needs an industry before one can be built.</p>
          )}
          {status.offer && status.urls.funnelSrc ? (
            <LinkRow icon={ExternalLink} title="Offer page" href={status.urls.funnelSrc} onCopy={() => void copy(status.urls.funnelSrc, "Offer link")} />
          ) : (
            <div className="pt-2 space-y-2">
              <p className="text-[12px] text-[var(--ods-text-tertiary)]">
                {status.urls.industryKey ? `There is no offer page for ${industry ?? "this industry"} yet.` : "No offer page: set this business's industry first."}
              </p>
              {status.urls.industryKey && (
                <button onClick={() => ensureOffer.mutate()} disabled={ensureOffer.isPending} className={`${BTN_PRIMARY} w-full`}>
                  <Plus className="w-3.5 h-3.5" /> {ensureOffer.isPending ? "Creating…" : "Create offer page"}
                </button>
              )}
            </div>
          )}
        </div>
      </Card>

      <Card title="Message" icon={MessageSquare}>
        <div className="space-y-2.5">
          <div>
            <div className="text-[12px] font-medium text-[var(--ods-text-tertiary)] mb-1">Send from</div>
            {free.length === 0 ? (
              <Notice tone="amber">No free number to send from. Add or free one up on the Phone Numbers page.</Notice>
            ) : (
              <SelectMenu
                value={fromId}
                onChange={setFromId}
                width={260}
                sections={[
                  {
                    title: "Your numbers",
                    options: free.map((n) => ({
                      value: n.id,
                      label: n.phoneNumber,
                      icon: <CountryFlag code={countryOfPhone(n)} />,
                      hint: theirCountry && countryOfPhone(n) === theirCountry ? "same country" : undefined,
                    })),
                  },
                ]}
                triggerClassName="w-full h-9 px-3 rounded-[8px] border border-[var(--ods-border-strong)] bg-[var(--ods-bg-primary)] text-[14px] font-semibold inline-flex items-center gap-2 tabular-nums"
                trigger={
                  <>
                    {from && <CountryFlag code={countryOfPhone(from)} />}
                    <span className="flex-1 text-left truncate">{from?.phoneNumber ?? "Choose a number"}</span>
                    <ChevronDown className="w-3 h-3 opacity-60" />
                  </>
                }
              />
            )}
            {mismatch && <div className="mt-2"><Notice tone="amber">This is a {fromCountry} number and they are in {theirCountry}. A local number gets more replies.</Notice></div>}
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[12px] font-medium text-[var(--ods-text-tertiary)]">Message</span>
              <span className="text-[12px] tabular-nums text-[var(--ods-text-tertiary)]">
                {sms.units} chars · {sms.segments} {sms.segments === 1 ? "segment" : "segments"}
              </span>
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              placeholder={status.urls.funnelSrc ? "Write the message…" : "Links appear here once this business has an industry."}
              className="w-full resize-y rounded-[8px] border border-[var(--ods-border-strong)] bg-[var(--ods-bg-primary)] px-3 py-2 text-[14px] leading-5 outline-none focus:border-[var(--ods-brand-500)]"
            />
          </div>
          {sentAt && <Notice tone="green">Marked as sent {new Date(sentAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}. Follow up on the offer page next.</Notice>}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => void copy(message, "Message")} disabled={!message} className={BTN_SECONDARY}>
              <Copy className="w-3.5 h-3.5" /> Copy
            </button>
            {smsHref ? (
              <a href={smsHref} className={BTN_SECONDARY} title="Open the message in your phone's SMS app">
                <Phone className="w-3.5 h-3.5" /> Phone SMS
              </a>
            ) : (
              <button disabled className={BTN_SECONDARY}>
                <Phone className="w-3.5 h-3.5" /> Phone SMS
              </button>
            )}
          </div>
          <button onClick={() => logSent.mutate()} disabled={!message || logSent.isPending} className={`${BTN_PRIMARY} w-full`}>
            <Check className="w-3.5 h-3.5" /> {logSent.isPending ? "Saving…" : "Mark as sent"}
          </button>
        </div>
      </Card>
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="p-3 space-y-3" role="status" aria-label="Loading">
      <div className="flex gap-1.5">
        <div className="h-6 w-24 rounded-md bg-[var(--ods-bg-tertiary)] animate-pulse" />
        <div className="h-6 w-28 rounded-md bg-[var(--ods-bg-tertiary)] animate-pulse" />
      </div>
      {[64, 112, 260].map((h, i) => (
        <div key={i} className="rounded-[10px] border border-[var(--ods-border)]">
          <div className="h-11 px-3 flex items-center border-b border-[var(--ods-border)]">
            <div className="h-3.5 w-20 rounded-md bg-[var(--ods-bg-tertiary)] animate-pulse" />
          </div>
          <div className="p-3">
            <div className="rounded-md bg-[var(--ods-bg-tertiary)] animate-pulse" style={{ height: h }} />
          </div>
        </div>
      ))}
    </div>
  );
}
