import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  RedirectIfAuthenticated,
  RequireDashboard,
  RequireSession,
} from "@/auth/guards";
import { LoginPage } from "@/auth/LoginPage";
import { ResetPasswordPage } from "@/auth/ResetPasswordPage";
import { MfaSetupPage } from "@/auth/MfaSetupPage";
import { MfaChallengePage } from "@/auth/MfaChallengePage";
import { NotAuthorizedPage } from "@/auth/NotAuthorizedPage";
import { Spinner } from "@/components/ui/spinner";

// Code-split the authenticated dashboard pages so the heavy charting library
// (Recharts) is only fetched after login, not on the login screen.
const OverviewPage = lazy(() =>
  import("@/features/dashboard/OverviewPage").then((m) => ({
    default: m.OverviewPage,
  })),
);
const SitesPage = lazy(() =>
  import("@/features/sites/SitesPage").then((m) => ({ default: m.SitesPage })),
);
const SiteDetailPage = lazy(() =>
  import("@/features/sites/SiteDetailPage").then((m) => ({
    default: m.SiteDetailPage,
  })),
);
const SyncRunsPage = lazy(() =>
  import("@/features/sync-runs/SyncRunsPage").then((m) => ({
    default: m.SyncRunsPage,
  })),
);
const SecuritySettingsPage = lazy(() =>
  import("@/auth/SecuritySettingsPage").then((m) => ({
    default: m.SecuritySettingsPage,
  })),
);
const SystemPage = lazy(() =>
  import("@/features/system/SystemPage").then((m) => ({
    default: m.SystemPage,
  })),
);
const DemoLayout = lazy(() =>
  import("@/features/demo/DemoPages").then((m) => ({
    default: m.DemoLayout,
  })),
);
const DemoOverviewPage = lazy(() =>
  import("@/features/demo/DemoPages").then((m) => ({
    default: m.DemoOverviewPage,
  })),
);
const DemoSitesPage = lazy(() =>
  import("@/features/demo/DemoPages").then((m) => ({
    default: m.DemoSitesPage,
  })),
);
const DemoSiteDetailPage = lazy(() =>
  import("@/features/demo/DemoPages").then((m) => ({
    default: m.DemoSiteDetailPage,
  })),
);
const DemoSyncHistoryPage = lazy(() =>
  import("@/features/demo/DemoPages").then((m) => ({
    default: m.DemoSyncHistoryPage,
  })),
);
const DemoSystemPage = lazy(() =>
  import("@/features/demo/DemoPages").then((m) => ({
    default: m.DemoSystemPage,
  })),
);

const demoFallback = (
  <div className="flex min-h-screen items-center justify-center">
    <Spinner className="h-6 w-6 text-muted-foreground" />
  </div>
);

function demoElement(element: ReactNode) {
  return <Suspense fallback={demoFallback}>{element}</Suspense>;
}

/**
 * Route map per brief §10. No registration route exists. Public auth pages
 * redirect already-authenticated users onward; the MFA pages require a session
 * but not yet aal2; the dashboard group requires aal2 + admin.
 */
export const router = createBrowserRouter(
  [
    // Public synthetic demo - it has no auth or Supabase data queries.
    {
      path: "/demo",
      element: demoElement(<DemoLayout />),
      children: [
        { index: true, element: demoElement(<DemoOverviewPage />) },
        { path: "sites", element: demoElement(<DemoSitesPage />) },
        {
          path: "sites/:siteSlug",
          element: demoElement(<DemoSiteDetailPage />),
        },
        {
          path: "sync-history",
          element: demoElement(<DemoSyncHistoryPage />),
        },
        { path: "system", element: demoElement(<DemoSystemPage />) },
      ],
    },

    // Public auth pages -------------------------------------------------------
    {
      element: <RedirectIfAuthenticated />,
      children: [{ path: "/login", element: <LoginPage /> }],
    },
    { path: "/reset-password", element: <ResetPasswordPage /> },
    { path: "/not-authorized", element: <NotAuthorizedPage /> },

    // MFA flow (session required, aal2 not yet) --------------------------------
    {
      element: <RequireSession />,
      children: [
        { path: "/mfa/setup", element: <MfaSetupPage /> },
        { path: "/mfa/verify", element: <MfaChallengePage /> },
      ],
    },

    // Protected dashboard (aal2 + admin) --------------------------------------
    {
      element: <RequireDashboard />,
      children: [
        {
          element: <AppLayout />,
          children: [
            { path: "/", element: <OverviewPage /> },
            { path: "/sites", element: <SitesPage /> },
            { path: "/sites/:siteId", element: <SiteDetailPage /> },
            { path: "/sync-runs", element: <SyncRunsPage /> },
            { path: "/system", element: <SystemPage /> },
            { path: "/settings/security", element: <SecuritySettingsPage /> },
          ],
        },
      ],
    },

    { path: "*", element: <Navigate to="/" replace /> },
  ],
  {
    // Opt into the v7 splat-path resolution now to de-risk the upgrade.
    // (v7_startTransition is a RouterProvider flag - see App.tsx.)
    future: {
      v7_relativeSplatPath: true,
    },
  },
);
