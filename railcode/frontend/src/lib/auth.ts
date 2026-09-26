import { api } from "@/lib/apiClient";
import type { DialerUser } from "@/components/auth/AuthProvider";

// On Railcode there are no dialer passwords: the platform gate signs org
// members in, and the worker identifies them via ctx.user (/api/auth/me).
// The old login/signup pages are unmounted in App.tsx; these remain only so
// existing imports keep compiling.

export async function signUp(_email: string, _password: string, _fullName: string) {
  throw new Error("Accounts come from the platform sign-in — there is nothing to register.");
}

export async function signIn(_email: string, _password: string) {
  throw new Error("Sign-in is handled by the platform — reload the app.");
}

export async function signOut() {
  window.location.href = "/_api/logout";
}

export async function getCurrentUser(): Promise<DialerUser | null> {
  try {
    const user = await api.auth.me();
    return user as unknown as DialerUser;
  } catch {
    return null;
  }
}

export function onAuthStateChange(callback: (user: DialerUser | null) => void) {
  // No-op — AuthProvider's focus listener handles re-validation.
  return { data: { subscription: { unsubscribe: () => {} } } };
}
