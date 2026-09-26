import React, { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/lib/apiClient";

export interface DialerUser {
  id: string;
  email: string;
  fullName: string | null;
  role: string;
  twentyUserId?: string;
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
    user_metadata: { full_name: fullName },
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<DialerUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = React.useCallback(async () => {
    // Platform identity: no token needed, the worker reads ctx.user.
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
