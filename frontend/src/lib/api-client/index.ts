const API_URL = import.meta.env.VITE_API_URL || "";

export const AUTH_TOKEN_KEY = "cold-dialer-token";

export function setAuthToken(token: string | null) {
  if (token) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  }
}

// Always read through localStorage: HMR/module re-evaluation must never lose
// the token from memory.
export function getAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

/** A non-2xx API response. `status` lets callers tell "signed out" (401) from a transient failure. */
export { ApiError } from "./api-error";
import { ApiError } from "./api-error";

/** Phone audio line (Call me / Dial in), as /api/audio-sessions returns it. */
export interface AudioSessionView {
  id: string;
  mode: "call_me" | "dial_in";
  status: "calling_agent" | "waiting_dial_in" | "ready" | "ended" | "failed";
  agentPhone: string | null;
  dialInNumber: string | null;
  pin: string | null;
  contactLegId: string | null;
  contactState: "idle" | "dialing" | "ringing" | "answered" | "ended";
  contactAnsweredAt: string | null;
  contactEndedAt: string | null;
  hangupCause: string | null;
  error: string | null;
}

export type CallCampaignStatus = "active" | "completed" | "archived";

/** A WAVV-style dial list (backend: /api/call-campaigns, stored in Twenty). */
export interface Person {
  id: string;
  name: string;
  jobTitle: string | null;
  role: string | null;
  city: string | null;
  avatarUrl: string | null;
  phone: string | null;
  email: string | null;
  linkedin: string | null;
  x: string | null;
  prospectId: string | null;
  createdAt: string | null;
}

export interface PersonInput {
  name: string;
  jobTitle?: string;
  role?: string;
  phone?: string;
  email?: string;
  linkedin?: string;
}

export interface CallCampaign {
  id: string;
  name: string;
  status: CallCampaignStatus;
  /** agencyProspect ids in dial order */
  contactIds: string[];
  createdByName: string | null;
  createdAt: string;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };

  const token = getAuthToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
    });
  } catch {
    // fetch only throws when no response arrived at all.
    throw new ApiError(0, "The dialer server could not be reached.", null, "NETWORK", path);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    const details = typeof body.details === "string" ? body.details : body.details ? JSON.stringify(body.details) : null;
    throw new ApiError(res.status, body.error || `Request failed: ${res.status}`, details, typeof body.code === "string" ? body.code : null, path);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  auth: {
    signup: (email: string, password: string, fullName: string) =>
      request<{ user: any; token: string }>("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({ email, password, fullName }),
      }),
    me: () => request<any>("/api/auth/me"),
  },

  leads: {
    list: () => request<any[]>("/api/leads"),
    get: (id: string) => request<any>(`/api/leads/${id}`),
    create: (data: any) =>
      request<any>("/api/leads", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) =>
      request<any>(`/api/leads/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<void>(`/api/leads/${id}`, { method: "DELETE" }),
    import: (rows: any[]) =>
      request<{ imported: number; total: number }>("/api/leads/import", {
        method: "POST",
        body: JSON.stringify({ rows }),
      }),
  },

  prospects: {
    list: () => request<any[]>("/api/prospects"),
    get: (id: string) => request<any>(`/api/prospects/${id}`),
    create: (data: any) =>
      request<any>("/api/prospects", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) =>
      request<any>(`/api/prospects/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<void>(`/api/prospects/${id}`, { method: "DELETE" }),
    import: (rows: any[]) =>
      request<{ imported: number; total: number }>("/api/prospects/import", {
        method: "POST",
        body: JSON.stringify({ rows }),
      }),
    websiteStatus: (id: string) =>
      request<{
        /** The one page we send (offer site), and whether this app may embed it. */
        page: { url: string; previewAllowed: boolean; previewBlockedReason: string | null };
        prospect: {
          id: string;
          slug?: string;
          niche?: string;
          label?: string;
          labelValue?: string;
          website?: string;
          phone?: string;
          phoneE164?: string;
          country?: string;
          city?: string;
          region?: string;
          videoStatus?: string;
          videoSource?: string;
          videoError?: string;
          videoUrl?: { primaryLinkUrl?: string; primaryLinkLabel?: string } | null;
          outboundState?: string;
          outboundLabel?: string;
          smsMetadata?: unknown;
          whatsappStatus?: string;
        };
        offer: {
          id: string;
          title?: string;
          heroH1?: string;
          status?: string;
          ctaType?: string;
          videoMode?: string;
          industryId?: string;
          videoUrl?: { primaryLinkUrl?: string; primaryLinkLabel?: string } | null;
        } | null;
        urls: {
          industryId: string;
          industryKey: string;
          pack: string;
          slug: string;
          offerDisplayUrl: string | null;
          funnelSrc: string;
          templateUrl: string | null;
          templateAvailable: boolean;
        };
      }>(`/api/prospects/${id}/website-status?origin=${encodeURIComponent(window.location.origin)}`),
    logWebsiteSent: (id: string, data: { templateUrl?: string; offerUrl?: string; fromNumber?: string; body?: string }) =>
      request<{ success: boolean; sentAt: string; outboundLabel: string | null }>(
        `/api/prospects/${id}/website-sent`,
        { method: "POST", body: JSON.stringify(data) },
      ),
    ensureOffer: (id: string) =>
      request<{ action: "existing" | "created"; industryKey: string; offer: any }>(
        `/api/prospects/${id}/ensure-offer`,
        { method: "POST" },
      ),
  },

  campaigns: {
    list: () => request<any[]>("/api/campaigns"),
    get: (id: string) => request<any>(`/api/campaigns/${id}`),
    create: (data: any) =>
      request<any>("/api/campaigns", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) =>
      request<any>(`/api/campaigns/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<void>(`/api/campaigns/${id}`, { method: "DELETE" }),
  },

  scripts: {
    list: () => request<any[]>("/api/scripts"),
    get: (id: string) => request<any>(`/api/scripts/${id}`),
    create: (data: any) =>
      request<any>("/api/scripts", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) =>
      request<any>(`/api/scripts/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<void>(`/api/scripts/${id}`, { method: "DELETE" }),
  },

  /** Paged contacts (prospects + leads); see lib/contacts.ts. */
  contacts: {
    page: (params: string) => request<unknown>(`/api/prospects/page?${params}`),
    facets: () => request<unknown>("/api/prospects/facets"),
    lookup: (ids: string[]) => request<unknown[]>(`/api/prospects/lookup?ids=${ids.map(encodeURIComponent).join(",")}`),
  },

  admin: {
    /** Create/update/delete events on dialer records since `since` (ISO), newest first. */
    activity: (since: string) =>
      request<import("@/lib/admin").AdminActivityResponse>(`/api/admin/activity?since=${encodeURIComponent(since)}`),
    /** Full history of specific records: "call:<id>,prospect:<id>". */
    recordActivity: (targets: string) =>
      request<import("@/lib/admin").AdminActivityResponse>(`/api/admin/activity?targets=${encodeURIComponent(targets)}`),
  },

  twentyPhones: {
    list: () => request<any[]>("/api/twenty/phones"),
    primary: () => request<{ phone: any; isPrimary: boolean; total: number }>("/api/twenty/phones/primary"),
    claim: (id: string, member: { memberId: string; memberEmail?: string }) =>
      request<any>(`/api/twenty/phones/${id}/claim`, { method: "POST", body: JSON.stringify(member) }),
    heartbeat: (id: string, member: { memberId: string }) =>
      request<any>(`/api/twenty/phones/${id}/heartbeat`, { method: "POST", body: JSON.stringify(member) }),
    setState: (id: string, data: { memberId: string; state: "DIALING" | "ACTIVE" | "IDLE" }) =>
      request<any>(`/api/twenty/phones/${id}/state`, { method: "POST", body: JSON.stringify(data) }),
    release: (id: string, data: { memberId: string; force?: boolean; callId?: string }) =>
      request<any>(`/api/twenty/phones/${id}/release`, { method: "POST", body: JSON.stringify(data) }),
  },

  audioSessions: {
    config: () =>
      request<{ callMeAvailable: boolean; dialInAvailable: boolean; dialInNumber: string | null; missing: string[] }>(
        "/api/audio-sessions/config",
      ),
    open: (data: { mode: "call_me" | "dial_in"; agentPhone?: string; from: string }) =>
      request<AudioSessionView>("/api/audio-sessions", { method: "POST", body: JSON.stringify(data) }),
    get: (id: string) => request<AudioSessionView>(`/api/audio-sessions/${id}`),
    dial: (id: string, data: { to: string; from: string }) =>
      request<{ contactLegId: string }>(`/api/audio-sessions/${id}/dial`, { method: "POST", body: JSON.stringify(data) }),
    hangup: (id: string) => request<void>(`/api/audio-sessions/${id}/hangup`, { method: "POST" }),
    end: (id: string) => request<void>(`/api/audio-sessions/${id}/end`, { method: "POST" }),
  },

  callCampaigns: {
    list: () => request<CallCampaign[]>("/api/call-campaigns"),
    create: (data: { contactIds: string[]; name: string }) =>
      request<CallCampaign>("/api/call-campaigns", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: { name?: string; status?: CallCampaignStatus }) =>
      request<CallCampaign>(`/api/call-campaigns/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/api/call-campaigns/${id}`, { method: "DELETE" }),
  },

  /** People at a business (agencyPerson): many per prospect, one per lead. */
  people: {
    list: (params: { prospectId?: string; leadId?: string }) =>
      request<Person[]>(`/api/people?${new URLSearchParams(params as Record<string, string>).toString()}`),
    create: (data: PersonInput & { prospectId?: string; leadId?: string }) =>
      request<Person>("/api/people", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<PersonInput>) =>
      request<Person>(`/api/people/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/api/people/${id}`, { method: "DELETE" }),
  },

  calls: {
    list: () => request<any[]>("/api/calls"),
    get: (id: string) => request<any>(`/api/calls/${id}`),
    create: (data: any) =>
      request<any>("/api/calls", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) =>
      request<any>(`/api/calls/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    record: (id: string) =>
      request<{ ok: boolean; telnyxRecordingId: string | null }>(`/api/calls/${id}/record`, { method: "POST" }),
    reconcile: (id: string) =>
      request<{ attached: boolean }>(`/api/calls/${id}/reconcile`, { method: "POST" }),
    /** Fresh, short-lived Telnyx download link for a call's recording. */
    audioUrl: (id: string) => request<{ url: string }>(`/api/calls/${id}/audio?format=json`),
    analyze: (id: string) =>
      request<{ ok: boolean; analysis: any; call: any }>(`/api/calls/${id}/analyze`, { method: "POST" }),
  },

  twentyMeta: {
    fields: (objectName: string) =>
      request<{
        object: { singular: string; plural: string };
        baseUrl: string;
        fields: Record<string, Array<{ label: string; value: string; color: string }>>;
      }>(
        `/api/twenty/meta/${objectName}`
      ),
  },

  callLogs: {
    list: () => request<any[]>("/api/call-logs"),
    get: (id: string) => request<any>(`/api/call-logs/${id}`),
    getByLead: (leadId: string) => request<any[]>(`/api/call-logs/lead/${leadId}`),
    create: (data: any) =>
      request<any>("/api/call-logs", { method: "POST", body: JSON.stringify(data) }),
  },

  profiles: {
    list: () => request<any[]>("/api/profiles"),
    get: (id: string) => request<any>(`/api/profiles/${id}`),
  },

  net: {
    check: (host: string, port: string | number) =>
      request<{ ok: boolean; ms: number; host: string; port: number; error?: string }>(
        `/api/netcheck?host=${encodeURIComponent(host)}&port=${encodeURIComponent(String(port))}`
      ),
  },
};
