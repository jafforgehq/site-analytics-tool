import { useAuth } from "@/auth/AuthProvider";
import { AuthShell } from "@/auth/AuthShell";
import { Button } from "@/components/ui/button";

/**
 * Shown when a fully authenticated, MFA-verified user is not in the admin
 * allowlist. They have a valid session but no access to portfolio data.
 */
export function NotAuthorizedPage() {
  const { user, signOut } = useAuth();
  return (
    <AuthShell title="Access not authorized">
      <p className="text-sm text-muted-foreground">
        The account{" "}
        <span className="font-medium text-foreground">{user?.email}</span> is
        signed in and MFA-verified, but it is not authorized to view this
        portfolio. Contact the portfolio owner if you believe this is a mistake.
      </p>
      <div className="mt-4">
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => void signOut()}
        >
          Sign out
        </Button>
      </div>
    </AuthShell>
  );
}
