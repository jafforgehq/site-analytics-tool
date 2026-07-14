import { type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";
import { AuthProvider } from "@/auth/AuthProvider";
import { PrivacyModeProvider } from "@/lib/privacy";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <PrivacyModeProvider>
        <AuthProvider>{children}</AuthProvider>
      </PrivacyModeProvider>
    </QueryClientProvider>
  );
}
