import { RouterProvider } from "react-router-dom";
import { AppProviders } from "@/app/providers";
import { router } from "@/app/router";

export function App() {
  // The public demo is a static experience. Skipping AuthProvider ensures it
  // never resolves a session or calls Supabase; navigation back to /login uses
  // a normal document load and restores the authenticated app providers.
  const isDemoRoute =
    window.location.pathname === "/demo" ||
    window.location.pathname.startsWith("/demo/");
  if (isDemoRoute) {
    return (
      <RouterProvider router={router} future={{ v7_startTransition: true }} />
    );
  }

  return (
    <AppProviders>
      <RouterProvider router={router} future={{ v7_startTransition: true }} />
    </AppProviders>
  );
}
