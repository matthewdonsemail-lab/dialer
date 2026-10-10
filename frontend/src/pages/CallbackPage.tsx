import React, { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { finishSignIn } from "@/lib/oauth";
import { getAuthToken } from "@/lib/api-client";
import { useAuth } from "@/components/auth/AuthProvider";
import { TropicalTideBackground } from "@/components/background-gradient/tropical-tide-background";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";

export function CallbackPage() {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const { error: toastError } = useToast();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    let cancelled = false;
    finishSignIn(`?${searchParams.toString()}`)
      .then(async () => {
        await refreshUser();
        if (cancelled) return;
        // refreshUser clears a token the server rejects; say so here rather than
        // letting the protected route bounce to /login with no explanation.
        if (!getAuthToken()) {
          toastError("Twenty signed you in, but the dialer rejected the new session. Start sign-in again.");
          navigate("/login", { replace: true });
          return;
        }
        navigate("/reports", { replace: true });
      })
      .catch((err: any) => {
        console.error("[CallbackPage] finishSignIn failed:", err);
        if (!cancelled) {
          toastError(err?.message ?? "Sign-in failed");
          navigate("/login", { replace: true });
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <TropicalTideBackground className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md py-16">
        <div className="bg-white/80 backdrop-blur-sm rounded-xl shadow-lg p-8 space-y-5 text-center">
          <div className="space-y-3" role="status" aria-label="Finishing sign-in">
            <Skeleton className="h-10 w-10 rounded-md mx-auto" />
            <Skeleton className="h-3.5 w-2/3 mx-auto" />
            <Skeleton className="h-3 w-1/2 mx-auto" />
          </div>
          <p className="text-sm text-gray-600">Finishing Twenty sign-in…</p>
        </div>
      </div>
    </TropicalTideBackground>
  );
}
