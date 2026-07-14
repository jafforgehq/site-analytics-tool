-- 0008_data_retention.sql
-- Retention / cleanup for the append-only growth tables, so the project stays
-- well under its database-size limit (see 0007_db_usage.sql).
--
-- Two entry points:
--   * public.prune_portfolio_data(dry_run) - the worker. Locked to the
--     scheduler/owner only. Deletes (or, when dry_run, just counts) rows older
--     than the retention windows and returns a summary.
--   * public.run_cleanup(dry_run) - admin+aal2 RPC wrapper for the dashboard's
--     manual "Run cleanup" button and its dry-run preview.
-- A weekly pg_cron job runs the worker automatically.
--
-- Retention windows (tunable - edit the locals below):
--   analytics_daily / search_daily ........ 540 days  (~18 months; supports YoY)
--   search_query_daily / search_page_daily  210 days  (high volume; only the
--                                           ≤90-day site view's current+previous
--                                           window needs them: 180 days + margin)
--   sync_runs ............................. 120 days  (attempt history)
--
-- An in-flight run (status = 'running') is never deleted, so cleanup can't race
-- the sync framework or break its one-running-per-integration unique index.

create extension if not exists pg_cron;

create or replace function public.prune_portfolio_data(p_dry_run boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_daily_days int := 540;
  v_terms_days int := 210;
  v_runs_days  int := 120;
  v_now        timestamptz := now();
  v_daily_cut  date        := (v_now - make_interval(days => v_daily_days))::date;
  v_terms_cut  date        := (v_now - make_interval(days => v_terms_days))::date;
  v_runs_cut   timestamptz := v_now - make_interval(days => v_runs_days);
  v_analytics  bigint;
  v_search     bigint;
  v_query      bigint;
  v_page       bigint;
  v_runs       bigint;
begin
  if p_dry_run then
    select count(*) into v_analytics
      from public.analytics_daily where metric_date < v_daily_cut;
    select count(*) into v_search
      from public.search_daily where metric_date < v_daily_cut;
    select count(*) into v_query
      from public.search_query_daily where metric_date < v_terms_cut;
    select count(*) into v_page
      from public.search_page_daily where metric_date < v_terms_cut;
    select count(*) into v_runs
      from public.sync_runs
      where started_at < v_runs_cut and status <> 'running';
  else
    delete from public.analytics_daily where metric_date < v_daily_cut;
    get diagnostics v_analytics = row_count;
    delete from public.search_daily where metric_date < v_daily_cut;
    get diagnostics v_search = row_count;
    delete from public.search_query_daily where metric_date < v_terms_cut;
    get diagnostics v_query = row_count;
    delete from public.search_page_daily where metric_date < v_terms_cut;
    get diagnostics v_page = row_count;
    delete from public.sync_runs
      where started_at < v_runs_cut and status <> 'running';
    get diagnostics v_runs = row_count;
  end if;

  return jsonb_build_object(
    'dry_run', p_dry_run,
    'executed_at', v_now,
    'cutoffs', jsonb_build_object(
      'daily', v_daily_cut,
      'search_terms', v_terms_cut,
      'sync_runs', v_runs_cut
    ),
    'deleted', jsonb_build_object(
      'analytics_daily', v_analytics,
      'search_daily', v_search,
      'search_query_daily', v_query,
      'search_page_daily', v_page,
      'sync_runs', v_runs
    )
  );
end;
$$;

-- The worker is for the scheduler/owner only - never the browser roles.
revoke all on function public.prune_portfolio_data(boolean) from public;
revoke all on function public.prune_portfolio_data(boolean) from anon, authenticated;

-- Admin RPC wrapper: the dashboard's only path in. Self-guards (admin + aal2),
-- then runs the worker. Executing as the owner lets it call the locked worker.
create or replace function public.run_cleanup(p_dry_run boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_portfolio_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'mfa required' using errcode = '42501';
  end if;
  return public.prune_portfolio_data(p_dry_run);
end;
$$;

revoke all on function public.run_cleanup(boolean) from public;
revoke all on function public.run_cleanup(boolean) from anon;
grant execute on function public.run_cleanup(boolean) to authenticated;

-- Weekly automated cleanup, Sundays 03:30 UTC (ahead of the 04:00 syncs).
-- Replace any existing job so re-running this migration is safe.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'site-analytics-cleanup') then
    perform cron.unschedule('site-analytics-cleanup');
  end if;
end;
$$;

select cron.schedule(
  'site-analytics-cleanup', '30 3 * * 0',
  $$select public.prune_portfolio_data(false)$$
);

-- ---------------------------------------------------------------------------
-- Inspection / ad hoc:
--   -- preview what cleanup would remove, without deleting:
--   select public.prune_portfolio_data(true);
--   -- run it now:
--   select public.prune_portfolio_data(false);
--   -- scheduled job + recent runs:
--   select jobname, schedule, active from cron.job where jobname = 'site-analytics-cleanup';
--   select status, return_message, start_time from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'site-analytics-cleanup')
--   order by start_time desc limit 10;
-- ---------------------------------------------------------------------------
