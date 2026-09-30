import React, { createContext, useContext, useEffect, useState } from "react";
import { api, getAuthToken } from "@/lib/api-client";

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<DialerUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = React.useCallback(async () => {
    const token = getAuthToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const raw = await api.auth.me();
      setUser(toDialerUser(raw));
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();

    // Re-verify on window focus (e.g. returning to the tab).
    const onFocus = () => {
      refreshUser();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshUser]);

  return (
    <AuthContext.Provider value={{ user, loading, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
