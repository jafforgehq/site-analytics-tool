import { Suspense } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  Globe,
  History,
  Database,
  ShieldCheck,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ExportAllDataButton } from "@/components/layout/ExportAllDataButton";
import { PrivacyModeToggle } from "@/components/layout/PrivacyModeToggle";
import { APP_COMMIT } from "@/lib/build-info";
import { usePrivacyMode } from "@/lib/privacy";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/sites", label: "Sites", icon: Globe, end: false },
  { to: "/sync-runs", label: "Sync history", icon: History, end: false },
  { to: "/system", label: "System", icon: Database, end: false },
  {
    to: "/settings/security",
    label: "Security",
    icon: ShieldCheck,
    end: false,
  },
];

/**
 * Shell layout for authenticated pages. Auth/MFA gating is added in Phase 3;
 * for now it provides the navigation chrome around routed content.
 */
export function AppLayout() {
  const { user, signOut } = useAuth();
  const privacy = usePrivacyMode();

  return (
    <div className="min-h-screen md:flex">
      <aside className="flex flex-col border-b border-border bg-card md:w-60 md:border-b-0 md:border-r">
        <div className="flex items-center gap-2 px-4 py-4">
          <img src="/favicon.svg" alt="" className="h-7 w-7" />
          <span className="text-sm font-semibold">Site Analytics</span>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:gap-0.5 md:pb-4">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )
              }
            >
              <Icon className="h-4 w-4" aria-hidden />
              {label}
            </NavLink>
          ))}
          <ExportAllDataButton />
          <PrivacyModeToggle />
        </nav>
        <div className="mt-auto hidden border-t border-border p-3 md:block">
          <p className="truncate px-1 pb-2 text-xs text-muted-foreground">
            {privacy.maskText(user?.email)}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={() => void signOut()}
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Sign out
          </Button>
          <p className="px-1 pt-3 text-[10px] font-medium text-muted-foreground">
            Commit {APP_COMMIT}
          </p>
        </div>
      </aside>
      <main className="flex-1 p-4 md:p-8">
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-20">
              <Spinner className="h-6 w-6 text-muted-foreground" />
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
