import { QueryClient } from "@tanstack/react-query";

/**
 * Single shared QueryClient. Lives in its own module so the auth layer can
 * import it to clear caches on sign out (Phase 3) without coupling to the
 * provider component.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
