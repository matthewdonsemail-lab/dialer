import React, { createContext, useContext, useEffect, useState } from "react";
import { decodeJwtPayload } from "@dialer/shared";
import { api, ApiError, getAuthToken, setAuthToken } from "@/domains/api/client";

export interface DialerUser {
  id: string;
  email: string;
  fullName: string | null;
  role: string;
  /**
   * The core."user" id of the signed-in person. NOT a member id - never send
   * this as `memberId`, the backend rejects it against the workspace member.
   */
  twentyUserId?: string;
  /**
   * The workspaceMember row id - the only identity the backend accepts in a
   * `memberId` body field. Null for a session minted before member resolution
   * existed; the backend answers 401 in that case, so send nothing rather than
   * a wrong id.
   */
  memberId?: string | null;
  /** Present so Layout's `user_metadata?.full_name` access keeps working. */
  user_metadata: { full_name: string | null };
}

interface AuthContextType {
  user: DialerUser | null;
  loading: boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  refreshUser: async () => {},
});

function toDialerUser(raw: any): DialerUser {
  const fullName = raw?.fullName ?? raw?.full_name ?? null;
  return {
    id: raw?.id ?? "",
    email: raw?.email ?? "",
    fullName,
    role: raw?.role ?? "agent",
    twentyUserId: raw?.twentyUserId,
    memberId: raw?.workspaceMemberId ?? raw?.member?.id ?? null,
    user_metadata: { full_name: fullName },
  };
}

/** Re-verify with the server at most this often when the window regains focus. */
const REVALIDATE_INTERVAL_MS = 5 * 60 * 1000;

/**
 * The session the stored dialer JWT describes, or null when there is none or
 * it has expired. `/api/auth/me` only echoes these claims, so the UI can be
 * restored without a round-trip; the server still verifies the signature on
 * every API call.
 */
function userFromStoredToken(): DialerUser | null {
  const token = getAuthToken();
  if (!token) return null;
  try {
    const claims = decodeJwtPayload<Record<string, unknown>>(token);
    if (typeof claims.exp === "number" && claims.exp * 1000 <= Date.now()) return null;
    return toDialerUser({
      id: claims.userId,
      email: claims.email,
      fullName: claims.memberName || claims.fullName || null,
      twentyUserId: claims.twentyUserId,
      workspaceMemberId: claims.workspaceMemberId,
    });
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<DialerUser | null>(userFromStoredToken);
  const lastVerifiedAt = React.useRef(0);

  const refreshUser = React.useCallback(async () => {
    const local = userFromStoredToken();
    if (!local) {
      setAuthToken(null);
      setUser(null);
      return;
    }
    setUser((current) => current ?? local);
    try {
      const raw = await api.auth.me();
      lastVerifiedAt.current = Date.now();
      setUser(toDialerUser(raw));
    } catch (error) {
      // Only the server saying "not signed in" ends the session. A rate limit,
      // network blip or 5xx must not log an operator out mid-call.
      if (error instanceof ApiError && error.status === 401) {
        setAuthToken(null);
        setUser(null);
      }
    }
  }, []);

  useEffect(() => {
    refreshUser();

    const onFocus = () => {
      if (Date.now() - lastVerifiedAt.current >= REVALIDATE_INTERVAL_MS) refreshUser();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshUser]);

  return (
    <AuthContext.Provider value={{ user, loading: false, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
