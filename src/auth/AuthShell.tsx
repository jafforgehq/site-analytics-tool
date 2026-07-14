import { type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Centered card layout shared by all unauthenticated / MFA pages.
 */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src="/favicon.svg" alt="" className="mb-3 h-10 w-10" />
          <h1 className="text-lg font-semibold">{title}</h1>
          {subtitle && (
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
        <Card>
          <CardContent>{children}</CardContent>
        </Card>
      </div>
    </div>
  );
}
