import React, { Suspense } from "react";
import { Routes, Route, Navigate, useParams } from "react-router-dom";
import { useAuth } from "@/components/auth/AuthProvider";
import { Layout } from "@/components/common/Layout";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { ToastProvider } from "@/components/ui/Toast";
import { PageSkeleton } from "@/components/ui/Skeleton";

const LoginPage = React.lazy(() => import("@/pages/LoginPage").then((m) => ({ default: m.LoginPage })));
const CallbackPage = React.lazy(() => import("@/pages/CallbackPage").then((m) => ({ default: m.CallbackPage })));
const SignupPage = React.lazy(() => import("@/pages/SignupPage").then((m) => ({ default: m.SignupPage })));
const ReportsPage = React.lazy(() => import("@/pages/ReportsPage").then((m) => ({ default: m.ReportsPage })));
const ProspectPage = React.lazy(() => import("@/pages/ProspectPage").then((m) => ({ default: m.ProspectPage })));
const ProspectDetailPage = React.lazy(() => import("@/pages/ProspectDetailPage").then((m) => ({ default: m.ProspectDetailPage })));
const LeadDetailPage = React.lazy(() => import("@/pages/LeadDetailPage").then((m) => ({ default: m.LeadDetailPage })));
const CallHistoryPage = React.lazy(() => import("@/pages/CallHistoryPage").then((m) => ({ default: m.CallHistoryPage })));
const PhoneNumbersPage = React.lazy(() => import("@/pages/PhoneNumbersPage").then((m) => ({ default: m.PhoneNumbersPage })));
const CallDetailPage = React.lazy(() => import("@/pages/CallDetailPage").then((m) => ({ default: m.CallDetailPage })));
const ScriptsPage = React.lazy(() => import("@/pages/ScriptsPage").then((m) => ({ default: m.ScriptsPage })));
const AdminPage = React.lazy(() => import("@/pages/AdminPage").then((m) => ({ default: m.AdminPage })));
const SettingsPage = React.lazy(() => import("@/pages/SettingsPage").then((m) => ({ default: m.SettingsPage })));

function PageSpinner() {
  return <PageSkeleton />;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="h-screen">
        <PageSkeleton />
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

/** Old /prospects/:id links now live under /contacts. */
function ProspectRedirect() {
  const { prospectId } = useParams();
  return <Navigate to={`/contacts/${prospectId}`} replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Suspense fallback={<PageSpinner />}><LoginPage /></Suspense>} />
      <Route path="/callback" element={<Suspense fallback={<PageSpinner />}><CallbackPage /></Suspense>} />
      <Route path="/signup" element={<Suspense fallback={<PageSpinner />}><SignupPage /></Suspense>} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Layout>
              <Suspense fallback={<PageSpinner />}>
                <Routes>
                  <Route index element={<Navigate to="/reports" replace />} />
                  <Route path="reports" element={<ReportsPage />} />
                  {/* Reports replaced the Dashboard; keep old links working. */}
                  <Route path="dashboard" element={<Navigate to="/reports" replace />} />
                  <Route path="leads" element={<Navigate to="/contacts" replace />} />
                  <Route path="contacts" element={<ProspectPage />} />
                  <Route path="prospects" element={<Navigate to="/contacts" replace />} />
                  <Route path="leads/:leadId" element={<LeadDetailPage />} />
                  <Route path="contacts/:prospectId" element={<ProspectDetailPage />} />
                  <Route path="prospects/:prospectId" element={<ProspectRedirect />} />
                  <Route path="campaigns" element={<Navigate to="/contacts" replace />} />
                  <Route path="scripts" element={<ScriptsPage />} />
                  <Route path="history" element={<CallHistoryPage />} />
                  <Route path="history/:callId" element={<CallDetailPage />} />
                  <Route path="phone-numbers" element={<PhoneNumbersPage />} />
                  <Route path="admin" element={<AdminPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                </Routes>
              </Suspense>
            </Layout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AppRoutes />
      </ToastProvider>
    </ErrorBoundary>
  );
}
