import type { IncomingHttpHeaders } from "http";

/**
 * The address of the person making a request, for per-client rate limiting.
 *
 * Production is Cloudflare → Vercel → Express. Express's `req.ip` is the
 * platform proxy, so every user shares one rate-limit bucket and one busy
 * operator can lock everyone else out of sign-in. Cloudflare reports the
 * real client in `CF-Connecting-IP`; Vercel reports its own client in
 * `X-Real-IP`. A spoofed header only changes which bucket the spoofer uses.
 */
export function clientIp(req: { headers: IncomingHttpHeaders; ip?: string; socket?: { remoteAddress?: string } }): string {
  for (const name of ["cf-connecting-ip", "x-real-ip"]) {
    const value = req.headers[name];
    const first = (Array.isArray(value) ? value[0] : value)?.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}
