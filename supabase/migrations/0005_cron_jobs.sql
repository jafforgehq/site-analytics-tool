-- 0005_cron_jobs.sql
-- Daily scheduled syncs via pg_cron + pg_net. Each job calls the corresponding
-- scheduled-sync-* Edge Function with the automation secret.
--
-- No secrets are hardcoded here: the function reads the project URL and the
-- automation secret from Supabase Vault at run time. Before the jobs can
-- succeed, create those two Vault secrets (Dashboard → Project Settings → Vault,
-- or SQL):
--   select vault.create_secret('https://YOUR_REF.supabase.co', 'project_url');
--   select vault.create_secret('YOUR_AUTOMATION_SECRET',       'automation_secret');
-- The automation_secret value MUST equal the AUTOMATION_SECRET Edge secret.
--
-- This migration is safe to re-run: it replaces the function and re-schedules
-- the jobs by name. sync_runs remains the source of truth for provider success -
-- a cron invocation succeeding only means the request was sent.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- One helper the cron jobs call. SECURITY DEFINER so it can read Vault; the
-- secret value never appears in cron.job.command (only this call does).
create or replace function public.invoke_scheduled_sync(p_source text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  if p_source not in ('gsc', 'ga4', 'bing') then
    raise exception 'Unknown sync source: %', p_source;
  end if;

  select decrypted_secret into v_url
  from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'automation_secret';

  if v_url is null or v_secret is null then
    raise exception 'Missing Vault secret project_url or automation_secret';
  end if;

  perform net.http_post(
    url := v_url || '/functions/v1/scheduled-sync-' || p_source,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Automation-Secret', v_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;

-- Only the scheduler (postgres) may invoke this - never the browser roles.
revoke all on function public.invoke_scheduled_sync(text) from public;
revoke all on function public.invoke_scheduled_sync(text) from anon, authenticated;

-- Replace any existing site-analytics cron jobs so re-running is safe.
do $$
declare
  j text;
begin
  for j in select jobname from cron.job where jobname like 'site-analytics-sync-%' loop
    perform cron.unschedule(j);
  end loop;
end;
$$;

-- Daily, staggered, in UTC (Supabase server time is UTC).
select cron.schedule(
  'site-analytics-sync-gsc', '0 4 * * *',
  $$select public.invoke_scheduled_sync('gsc')$$
);
select cron.schedule(
  'site-analytics-sync-ga4', '10 4 * * *',
  $$select public.invoke_scheduled_sync('ga4')$$
);
select cron.schedule(
  'site-analytics-sync-bing', '20 4 * * *',
  $$select public.invoke_scheduled_sync('bing')$$
);

-- ---------------------------------------------------------------------------
-- Inspection (run ad hoc; not part of the schema):
--
--   -- scheduled jobs
--   select jobid, jobname, schedule, active from cron.job
--   where jobname like 'site-analytics-sync-%';
--
--   -- recent cron run history (did the job fire?)
--   select jobid, status, return_message, start_time
--   from cron.job_run_details order by start_time desc limit 20;
--
--   -- recent outbound HTTP responses from pg_net (did the function answer?)
--   select id, status_code, created from net._http_response
--   order by created desc limit 20;
--
--   -- the real source of truth: did the provider data actually sync?
--   select started_at, source, status, rows_written, error_code
--   from public.sync_runs order by started_at desc limit 20;
--
-- Fire one now without waiting for 04:00 UTC:
--   select public.invoke_scheduled_sync('gsc');
-- ---------------------------------------------------------------------------
