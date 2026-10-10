/**
 * Deep link straight into the dialer lead page (`/leads/:leadId`
 * in `frontend/src/App.tsx` -> `LeadDetailPage`).
 *
 * Tapping the Bark notification opens this URL directly on the phone.
 * Same-origin Vercel deploy means the backend often shares the host
 * with the frontend, so when FRONTEND_URL is unset we fall back to the
 * incoming request's origin (honouring x-forwarded-proto/host).
 *
 * Pure: the request is reduced to plain values by the caller.
 */
export function buildLeadDeepLink(input: {
  frontendUrl?: string | undefined;
  proto: string;
  host: string;
  leadId: string;
}): string {
  const path = `/leads/${encodeURIComponent(input.leadId)}`;
  const configured = (input.frontendUrl || "").trim().replace(/\/+$/, "");
  if (configured) return `${configured}${path}`;
  if (!input.host) return path;
  return `${input.proto || "https"}://${input.host}${path}`;
}