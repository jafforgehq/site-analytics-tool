import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

/**
 * Service-role client for privileged server-side writes. Never exposed to the
 * browser. RLS is bypassed, so all access decisions are made in code first.
 */
export function createAdminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Client scoped to a caller's JWT - runs as that user (RLS + is_portfolio_admin
 * apply). Used only to confirm admin authorization, never to write.
 */
export function createUserClient(token: string): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
  }
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export type { SupabaseClient };
