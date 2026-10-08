import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { finishSignIn } from "@/lib/oauth";
import { getAuthToken } from "@/lib/api-client";
import { useAuth } from "@/components/auth/AuthProvider";
import { AlertCircle } from "lucide-react";
import { TropicalTideBackground } from "@/components/background-gradient/tropical-tide-background";
import { Spokes } from "@/components/ui/Spinner";

export function CallbackPage() {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    finishSignIn(`?${searchParams.toString()}`)
      .then(async () => {
        await refreshUser();
        if (cancelled) return;
        // refreshUser clears a token the server rejects; say so here rather than
        // letting the protected route bounce to /login with no explanation.
        if (!getAuthToken()) {
          setError("Twenty signed you in, but the dialer rejected the new session. Start sign-in again.");
          return;
        }
        navigate("/dashboard", { replace: true });
      })
      .catch((err: any) => {
        console.error("[CallbackPage] finishSignIn failed:", err);
        if (!cancelled) setError(err?.message ?? "Sign-in failed");
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
          {error ? (
            <>
              <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm text-left">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
              <Link to="/login" className="inline-block text-sm font-medium text-brand-700 hover:text-brand-800">
                Back to sign in
              </Link>
            </>
          ) : (
            <>
              <Spokes className="h-8 w-8 text-brand-600 mx-auto" />
              <p className="text-sm text-gray-600">Finishing Twenty sign-in…</p>
            </>
          )}
        </div>
      </div>
    </TropicalTideBackground>
  );
}
