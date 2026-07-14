import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { FullPageSpinner } from "@/components/ui/spinner";

/**
 * Full dashboard access: requires a resolved session that is aal2 AND belongs
 * to an authorized admin. Anything short of that redirects to the correct
 * remediation step. Protected data is never rendered before resolution.
 */
export function RequireDashboard() {
  const { status } = useAuth();
  const location = useLocation();

  switch (status) {
    case "loading":
      return <FullPageSpinner label="Checking your session" />;
    case "signed-out":
      return <Navigate to="/login" replace state={{ from: location }} />;
    case "needs-mfa-setup":
      return <Navigate to="/mfa/setup" replace />;
    case "needs-mfa-verify":
      return <Navigate to="/mfa/verify" replace />;
    case "not-admin":
      return <Navigate to="/not-authorized" replace />;
    case "ready":
      return <Outlet />;
  }
}

/**
 * For the MFA pages: requires a session (any assurance level), but bounces
 * fully-ready users back to the dashboard so they can't re-run enrollment.
 */
export function RequireSession() {
  const { status } = useAuth();

  switch (status) {
    case "loading":
      return <FullPageSpinner label="Checking your session" />;
    case "signed-out":
      return <Navigate to="/login" replace />;
    case "ready":
      return <Navigate to="/" replace />;
    default:
      return <Outlet />;
  }
}

/**
 * For public auth pages (login): send already-authenticated users onward.
 */
export function RedirectIfAuthenticated() {
  const { status } = useAuth();

  if (status === "loading")
    return <FullPageSpinner label="Checking your session" />;
  if (status === "ready") return <Navigate to="/" replace />;
  if (status === "needs-mfa-setup") return <Navigate to="/mfa/setup" replace />;
  if (status === "needs-mfa-verify")
    return <Navigate to="/mfa/verify" replace />;
  return <Outlet />;
}
