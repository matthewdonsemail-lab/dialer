const API_URL = import.meta.env.VITE_API_URL || "";

let authToken: string | null = localStorage.getItem("cold-dialer-token");

export function setAuthToken(token: string | null) {
  authToken = token;
  if (token) {
    localStorage.setItem("cold-dialer-token", token);
  } else {
    localStorage.removeItem("cold-dialer-token");
  }
}

export function getAuthToken(): string | null {
  return authToken;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };

  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `Request failed: ${res.status}`);
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
    login: (email: string, password: string) =>
      request<{ user: any; token: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
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
      }>(`/api/prospects/${id}/website-status`),
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

  twentyPhones: {
    list: () => request<any[]>("/api/twenty/phones"),
    claim: (id: string, member: { memberId: string; memberEmail?: string }) =>
      request<any>(`/api/twenty/phones/${id}/claim`, { method: "POST", body: JSON.stringify(member) }),
    setState: (id: string, data: { memberId: string; state: "DIALING" | "ACTIVE" }) =>
      request<any>(`/api/twenty/phones/${id}/state`, { method: "POST", body: JSON.stringify(data) }),
    release: (id: string, data: { memberId: string; force?: boolean; callId?: string }) =>
      request<any>(`/api/twenty/phones/${id}/release`, { method: "POST", body: JSON.stringify(data) }),
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
  },

  twentyMeta: {
    fields: (objectName: string) =>
      request<{ fields: Record<string, Array<{ label: string; value: string; color: string }>> }>(
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
