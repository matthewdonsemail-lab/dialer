import React, { Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/components/auth/AuthProvider";
import { Layout } from "@/components/common/Layout";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { ToastProvider } from "@/components/ui/Toast";
import { Spokes } from "@/components/ui/Spinner";

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

// Platform gate signs org members in; identity comes from /api/auth/me.
// No login wall inside the app — show a loading spinner, then the full UI.
// If identity fails, the worker answers 401 and pages render their error states.
function PlatformGate({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth();
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spokes className="h-8 w-8 text-brand-600" />
      </div>
    );
  }
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/*"
        element={
          <PlatformGate>
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
          </PlatformGate>
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
