import React from "react";
import { Link } from "react-router-dom";
import { AlertCircle, LogIn } from "lucide-react";

/**
 * Sign up is disabled — members are created in Twenty, not in the dialer.
 * This page is kept so the route resolves; it redirects users to login.
 */
export function SignupPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 to-brand-100 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-brand-900">Cold Dialer</h1>
          <p className="text-brand-600 mt-2">Member access</p>
        </div>
        <div className="bg-white rounded-xl shadow-lg p-8 space-y-5">
          <div className="flex items-center gap-2 text-amber-700 bg-amber-50 p-3 rounded-lg text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            Sign up is disabled. Members are created in Twenty. Sign in with your Twenty credentials.
          </div>
          <Link
            to="/login"
            className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-semibold py-3 rounded-lg transition"
          >
            <LogIn className="w-5 h-5" />
            Go to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
