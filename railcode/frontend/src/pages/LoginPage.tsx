import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { signIn } from "@/lib/auth";
import { useAuth } from "@/components/auth/AuthProvider";
import { LogIn, Mail, Lock } from "lucide-react";
import { z } from "zod";
import { TropicalTideBackground } from "@/components/background-gradient/tropical-tide-background";
import { useToast } from "@/components/ui/Toast";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export function LoginPage() {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const { error: toastError } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      toastError(result.error.issues.map((issue) => issue.message).join(" "));
      return;
    }

    setLoading(true);
    try {
      await signIn(email, password);
      await refreshUser();
      navigate("/dashboard");
    } catch (err: any) {
      toastError(err.message ?? "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <TropicalTideBackground className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md py-16">
        <form onSubmit={handleSubmit} className="bg-white/80 backdrop-blur-sm rounded-xl shadow-lg p-8 space-y-5">
          <h2 className="text-xl font-semibold text-gray-800">Sign In</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition"
                placeholder="you@company.com"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition"
                placeholder="••••••••"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white font-semibold py-3 rounded-lg transition"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <LogIn className="w-5 h-5" />
                Sign In
              </>
            )}
          </button>
          <p className="text-center text-sm text-gray-500">
            Members are created in Twenty. Sign in with your Twenty credentials.
          </p>
        </form>
      </div>
    </TropicalTideBackground>
  );
}
