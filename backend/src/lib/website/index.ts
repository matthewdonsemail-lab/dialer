/**
 * The prospect's page on the offer site. One page per prospect: it shows the
 * site we built for them, the walkthrough video and the booking quiz, so the
 * dialer links to exactly one URL.
 *
 * OFFER_BASE_URL overrides the host. The agencyCampaign rows still carry the
 * old vercel.app bases from before the move to offer.listeningkit.com; they
 * are not used for links any more.
 */
export const DEFAULT_OFFER_BASE_URL = "https://offer.listeningkit.com";

export function offerBaseUrl(): string {
  return (process.env.OFFER_BASE_URL || DEFAULT_OFFER_BASE_URL).replace(/\/$/, "");
}

export function prospectPageUrl(prospectId: string, base = offerBaseUrl()): string {
  return `${base}/offer/prospect/${encodeURIComponent(prospectId)}`;
}

/**
 * Can `origin` show `headers`' page in an iframe? Reads CSP frame-ancestors
 * (which wins) or X-Frame-Options. Pure.
 */
export function frameAllowed(headers: { csp?: string | null; xfo?: string | null }, origin: string): boolean {
  const ancestors = /frame-ancestors\s+([^;]+)/i.exec(headers.csp ?? "")?.[1]?.trim();
  if (ancestors) {
    const sources = ancestors.split(/\s+/);
    if (sources.includes("'none'")) return false;
    if (sources.includes("*")) return true;
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      return false;
    }
    return sources.some((src) => {
      if (src === "'self'") return false; // the page's own origin is never the dialer
      const m = /^(https?:)?\/\/?(\*\.)?([^/:]+)(:\d+)?$/i.exec(src.replace(/^(https?:)(?!\/\/)/i, "$1//"));
      if (!m) return false;
      const [, scheme, wildcard, host, port] = m;
      if (scheme && scheme.toLowerCase() !== url.protocol) return false;
      if (port && port.slice(1) !== (url.port || (url.protocol === "https:" ? "443" : "80"))) return false;
      const h = url.hostname.toLowerCase();
      return wildcard ? h.endsWith(`.${host.toLowerCase()}`) : h === host.toLowerCase();
    });
  }
  const xfo = (headers.xfo ?? "").trim().toUpperCase();
  return !(xfo === "DENY" || xfo === "SAMEORIGIN");
}

const cache = new Map<string, { at: number; headers: { csp: string | null; xfo: string | null } }>();

/** Fetches the page's framing headers (cached 10 minutes per URL). */
export async function framingHeaders(url: string): Promise<{ csp: string | null; xfo: string | null } | null> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.headers;
  try {
    const res = await fetch(url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(6000) });
    const headers = { csp: res.headers.get("content-security-policy"), xfo: res.headers.get("x-frame-options") };
    cache.set(url, { at: Date.now(), headers });
    return headers;
  } catch {
    return null;
  }
}
