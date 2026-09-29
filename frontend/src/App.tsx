import React, { Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/components/auth/AuthProvider";
import { Layout } from "@/components/common/Layout";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { ToastProvider } from "@/components/ui/Toast";
import { Spokes } from "@/components/ui/Spinner";

const LoginPage = React.lazy(() => import("@/pages/LoginPage").then((m) => ({ default: m.LoginPage })));
const CallbackPage = React.lazy(() => import("@/pages/CallbackPage").then((m) => ({ default: m.CallbackPage })));
const SignupPage = React.lazy(() => import("@/pages/SignupPage").then((m) => ({ default: m.SignupPage })));
const DashboardPage = React.lazy(() => import("@/pages/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const LeadsPage = React.lazy(() => import("@/pages/LeadsPage").then((m) => ({ default: m.LeadsPage })));
const ProspectPage = React.lazy(() => import("@/pages/ProspectPage").then((m) => ({ default: m.ProspectPage })));
const ProspectDetailPage = React.lazy(() => import("@/pages/ProspectDetailPage").then((m) => ({ default: m.ProspectDetailPage })));
const LeadDetailPage = React.lazy(() => import("@/pages/LeadDetailPage").then((m) => ({ default: m.LeadDetailPage })));
const CampaignPage = React.lazy(() => import("@/pages/CampaignPage").then((m) => ({ default: m.CampaignPage })));
const CallHistoryPage = React.lazy(() => import("@/pages/CallHistoryPage").then((m) => ({ default: m.CallHistoryPage })));
const PhoneNumbersPage = React.lazy(() => import("@/pages/PhoneNumbersPage").then((m) => ({ default: m.PhoneNumbersPage })));
const CallDetailPage = React.lazy(() => import("@/pages/CallDetailPage").then((m) => ({ default: m.CallDetailPage })));
const ScriptsPage = React.lazy(() => import("@/pages/ScriptsPage").then((m) => ({ default: m.ScriptsPage })));
const AdminPage = React.lazy(() => import("@/pages/AdminPage").then((m) => ({ default: m.AdminPage })));

function PageSpinner() {
  return (
    <div className="flex items-center justify-center h-64">
      <Spokes className="h-8 w-8 text-brand-600" />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spokes className="h-8 w-8 text-brand-600" />
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
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
                  <Route index element={<Navigate to="/dashboard" replace />} />
                  <Route path="dashboard" element={<DashboardPage />} />
                  <Route path="leads" element={<LeadsPage />} />
                  <Route path="prospects" element={<ProspectPage />} />
                  <Route path="leads/:leadId" element={<LeadDetailPage />} />
                  <Route path="prospects/:prospectId" element={<ProspectDetailPage />} />
                  <Route path="campaigns" element={<CampaignPage />} />
                  <Route path="scripts" element={<ScriptsPage />} />
                  <Route path="history" element={<CallHistoryPage />} />
                  <Route path="history/:callId" element={<CallDetailPage />} />
                  <Route path="phone-numbers" element={<PhoneNumbersPage />} />
                  <Route path="admin" element={<AdminPage />} />
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
