import React, { Suspense } from "react";
import { Routes, Route, Navigate, useParams } from "react-router-dom";
import { useAuth } from "@/components/auth/AuthProvider";
import { Layout } from "@/components/common/Layout";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { ToastProvider } from "@/components/ui/Toast";
import {
  AppShellSkeleton,
  AuthCardSkeleton,
  CallReviewSkeleton,
  ContactWorkspaceSkeleton,
  ReportStylePageSkeleton,
  ScriptsPageSkeleton,
  TablePageSkeleton,
} from "@/components/ui/PageSkeletons";

const LoginPage = React.lazy(() => import("@/pages/LoginPage").then((m) => ({ default: m.LoginPage })));
const CallbackPage = React.lazy(() => import("@/pages/CallbackPage").then((m) => ({ default: m.CallbackPage })));
const SignupPage = React.lazy(() => import("@/pages/SignupPage").then((m) => ({ default: m.SignupPage })));
const ReportsPage = React.lazy(() => import("@/pages/ReportsPage").then((m) => ({ default: m.ReportsPage })));
const ProspectPage = React.lazy(() => import("@/pages/ProspectPage").then((m) => ({ default: m.ProspectPage })));
const ContactPage = React.lazy(() => import("@/domains/contact").then((m) => ({ default: m.ContactPage })));
const CallHistoryPage = React.lazy(() => import("@/pages/CallHistoryPage").then((m) => ({ default: m.CallHistoryPage })));
const PhoneNumbersPage = React.lazy(() => import("@/pages/PhoneNumbersPage").then((m) => ({ default: m.PhoneNumbersPage })));
const CallDetailPage = React.lazy(() => import("@/pages/CallDetailPage").then((m) => ({ default: m.CallDetailPage })));
const ScriptsPage = React.lazy(() => import("@/pages/ScriptsPage").then((m) => ({ default: m.ScriptsPage })));
const AdminPage = React.lazy(() => import("@/pages/AdminPage").then((m) => ({ default: m.AdminPage })));
const SettingsPage = React.lazy(() => import("@/pages/SettingsPage").then((m) => ({ default: m.SettingsPage })));

/** A lazy page with the skeleton of that page as its fallback while its code downloads. */
function Lazy({ fallback, children }: { fallback: React.ReactNode; children: React.ReactNode }) {
  return <Suspense fallback={fallback}>{children}</Suspense>;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <AppShellSkeleton />;
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
      <Route path="/login" element={<Lazy fallback={<AuthCardSkeleton />}><LoginPage /></Lazy>} />
      <Route path="/callback" element={<Lazy fallback={<AuthCardSkeleton />}><CallbackPage /></Lazy>} />
      <Route path="/signup" element={<Lazy fallback={<AuthCardSkeleton />}><SignupPage /></Lazy>} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Layout>
              {/* Each route below has its own skeleton; this outer one only catches anything missed. */}
              <Suspense fallback={<ReportStylePageSkeleton />}>
                <Routes>
                  <Route index element={<Navigate to="/reports" replace />} />
                  <Route path="reports" element={<Lazy fallback={<ReportStylePageSkeleton pickers={2} />}><ReportsPage /></Lazy>} />
                  {/* Reports replaced the Dashboard; keep old links working. */}
                  <Route path="dashboard" element={<Navigate to="/reports" replace />} />
                  <Route path="leads" element={<Navigate to="/contacts" replace />} />
                  <Route path="contacts" element={<Lazy fallback={<TablePageSkeleton columns={10} filters={3} />}><ProspectPage /></Lazy>} />
                  <Route path="prospects" element={<Navigate to="/contacts" replace />} />
                  <Route path="leads/:leadId" element={<Lazy fallback={<ContactWorkspaceSkeleton />}><ContactPage key="lead" type="lead" /></Lazy>} />
                  <Route path="contacts/:prospectId" element={<Lazy fallback={<ContactWorkspaceSkeleton />}><ContactPage key="prospect" type="prospect" /></Lazy>} />
                  <Route path="prospects/:prospectId" element={<ProspectRedirect />} />
                  <Route path="campaigns" element={<Navigate to="/contacts" replace />} />
                  <Route path="scripts" element={<Lazy fallback={<ScriptsPageSkeleton />}><ScriptsPage /></Lazy>} />
                  <Route path="history" element={<Lazy fallback={<TablePageSkeleton columns={8} filters={6} />}><CallHistoryPage /></Lazy>} />
                  <Route path="history/:callId" element={<Lazy fallback={<CallReviewSkeleton />}><CallDetailPage /></Lazy>} />
                  <Route path="phone-numbers" element={<Lazy fallback={<TablePageSkeleton columns={7} filters={0} />}><PhoneNumbersPage /></Lazy>} />
                  <Route path="admin" element={<Lazy fallback={<ReportStylePageSkeleton pickers={1} />}><AdminPage /></Lazy>} />
                  <Route path="settings" element={<Lazy fallback={<ReportStylePageSkeleton pickers={0} settings />}><SettingsPage /></Lazy>} />
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
