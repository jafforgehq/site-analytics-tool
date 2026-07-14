-- 0002_rls.sql
-- Row Level Security for every browser-readable table.
--
-- Access model (read-only for the browser):
--   * PERMISSIVE policy grants SELECT to portfolio admins.
--   * RESTRICTIVE policy additionally requires an aal2 (MFA-verified) session.
--
-- Both must pass, so a row is visible only to an admin whose JWT is aal2.
-- A lone restrictive policy would deny everything (no permissive grant), which
-- is why each table gets both. No INSERT/UPDATE/DELETE policies exist - all
-- writes happen server-side via Edge Functions using privileged credentials.

alter table public.sites enable row level security;
alter table public.analytics_daily enable row level security;
alter table public.search_daily enable row level security;
alter table public.sync_runs enable row level security;
alter table public.integration_status enable row level security;

-- sites -----------------------------------------------------------------------
create policy "sites admin select"
  on public.sites as permissive for select to authenticated
  using (public.is_portfolio_admin());

create policy "sites require aal2"
  on public.sites as restrictive for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2');

-- analytics_daily -------------------------------------------------------------
create policy "analytics_daily admin select"
  on public.analytics_daily as permissive for select to authenticated
  using (public.is_portfolio_admin());

create policy "analytics_daily require aal2"
  on public.analytics_daily as restrictive for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2');

-- search_daily ----------------------------------------------------------------
create policy "search_daily admin select"
  on public.search_daily as permissive for select to authenticated
  using (public.is_portfolio_admin());

create policy "search_daily require aal2"
  on public.search_daily as restrictive for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2');

-- sync_runs -------------------------------------------------------------------
create policy "sync_runs admin select"
  on public.sync_runs as permissive for select to authenticated
  using (public.is_portfolio_admin());

create policy "sync_runs require aal2"
  on public.sync_runs as restrictive for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2');

-- integration_status ----------------------------------------------------------
create policy "integration_status admin select"
  on public.integration_status as permissive for select to authenticated
  using (public.is_portfolio_admin());

create policy "integration_status require aal2"
  on public.integration_status as restrictive for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2');

-- ---------------------------------------------------------------------------
-- Data API exposure (controlled manually)
-- ---------------------------------------------------------------------------
-- The project is created with "Automatically expose new tables" disabled, so
-- tables are not reachable through the Data API until explicitly granted.
-- Grant SELECT only to `authenticated` (admins reach it via RLS); `anon` gets
-- nothing. RLS still filters which rows are visible. No INSERT/UPDATE/DELETE
-- grants - all writes happen server-side with privileged credentials.
grant usage on schema public to authenticated;

grant select on
  public.sites,
  public.analytics_daily,
  public.search_daily,
  public.sync_runs,
  public.integration_status
to authenticated;

-- Defensive: ensure the anonymous role can never read these tables, even if
-- auto-expose is toggled on later.
revoke all on
  public.sites,
  public.analytics_daily,
  public.search_daily,
  public.sync_runs,
  public.integration_status
from anon;
