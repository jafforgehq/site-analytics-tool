-- 0004_service_role_grants.sql
-- The project was created with "automatically expose new tables" disabled,
-- which suppresses the automatic Data API grants for every role - including
-- service_role. The Edge Functions write as service_role (RLS-bypassing but
-- still bound by table privileges), so without these grants any server-side
-- insert/update/delete fails with "permission denied for table ...".
--
-- Grant only the DML the sync framework and site management actually need.
-- The browser roles (anon/authenticated) are intentionally NOT granted writes.

grant usage on schema public to service_role;

grant select, insert, update, delete on
  public.sites,
  public.analytics_daily,
  public.search_daily,
  public.sync_runs,
  public.integration_status
to service_role;
