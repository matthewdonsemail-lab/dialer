import React, { useState } from "react";
import { beginSignIn } from "@/lib/oauth";
import { LogIn, AlertCircle } from "lucide-react";
import { TropicalTideBackground } from "@/components/background-gradient/tropical-tide-background";

export function LoginPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    setError("");
    setLoading(true);
    try {
      await beginSignIn();
      // Redirects to Twenty — no navigate here.
    } catch (err: any) {
      setError(err.message ?? "Login failed");
      setLoading(false);
    }
  }

  return (
    <TropicalTideBackground className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md py-16">
        <div className="bg-white/80 backdrop-blur-sm rounded-xl shadow-lg p-8 space-y-5">
          <h2 className="text-xl font-semibold text-gray-800">Sign In</h2>
          {error && (
            <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
          <button
            type="button"
            onClick={handleSignIn}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white font-semibold py-3 rounded-lg transition"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <LogIn className="w-5 h-5" />
                Continue with Twenty
              </>
            )}
          </button>
          <p className="text-center text-sm text-gray-500">
            Members are created in Twenty. Sign in with your Twenty account — no dialer password needed.
          </p>
        </div>
      </div>
    </TropicalTideBackground>
  );
}
