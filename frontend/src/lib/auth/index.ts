import { setAuthToken } from "@/lib/api-client";
import { api } from "@/lib/api-client";
import { clearOperatorSession } from "@/lib/oauth";
import type { DialerUser } from "@/components/auth/AuthProvider";

const API_URL = import.meta.env.VITE_API_URL || "";
const isApiMode = Boolean(API_URL);

/**
 * Sign up is disabled — members are created in Twenty, not in the dialer.
 * Kept for compatibility with SignupPage but always returns an error.
 */
export async function signUp(_email: string, _password: string, _fullName: string) {
  throw new Error(
    "Sign up is disabled. Create the member in Twenty, then sign in with Twenty SSO.",
  );
}

export async function signOut() {
  clearOperatorSession();
  setAuthToken(null);
}

export async function getCurrentUser(): Promise<DialerUser | null> {
  if (!isApiMode) return null;
  try {
    const user = await api.auth.me();
    return user as unknown as DialerUser;
  } catch {
    return null;
  }
}

export function onAuthStateChange(callback: (user: DialerUser | null) => void) {
  // No-op in API mode — AuthProvider's focus listener handles re-validation.
  return { data: { subscription: { unsubscribe: () => {} } } };
}
