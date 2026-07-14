-- seed.sql
-- Local development seed data. Loaded automatically by `supabase db reset`.
-- Lets the dashboard be evaluated before any real Google/Bing credentials are
-- configured. All values are synthetic and deterministic.
--
-- NOTE: This seeds sites + metrics + history only. It does NOT create an admin
-- user - RLS still requires an admin (aal2) session to read this data. To make
-- yourself an admin locally:
--   1. Create a user (Studio → Authentication, or the app's login once Phase 3
--      lands). Sign-up is disabled, so add the user via Studio.
--   2. Copy the user's UUID and run:
--        insert into private.admin_users (user_id) values ('<uuid>');
--   3. Enroll TOTP MFA through the app to reach aal2.

-- Idempotent: remove prior seed sites (cascades to metrics/status/runs).
delete from public.sites
where id in (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222'
);

-- ---------------------------------------------------------------------------
-- Sites (the AFTER INSERT trigger auto-creates integration_status rows)
-- ---------------------------------------------------------------------------
insert into public.sites (id, name, domain, website_url, gsc_property, ga4_property_id, bing_site_url, is_active)
values
  ('11111111-1111-1111-1111-111111111111', 'Aurora Recipes', 'aurora-recipes.example',
   'https://aurora-recipes.example', 'sc-domain:aurora-recipes.example', '123456789',
   'https://aurora-recipes.example/', true),
  -- Second site intentionally has NO Bing property → bing integration disabled.
  ('22222222-2222-2222-2222-222222222222', 'Northstar Notes', 'northstar-notes.example',
   'https://northstar-notes.example', 'sc-domain:northstar-notes.example', '987654321',
   null, true);

-- ---------------------------------------------------------------------------
-- Daily GA4 metrics - last 90 days, deterministic pseudo-random via hashtext
-- ---------------------------------------------------------------------------
insert into public.analytics_daily
  (site_id, metric_date, active_users, total_users, sessions, screen_page_views, engaged_sessions)
select
  s.id,
  d::date,
  base.active_users,
  base.active_users + (abs(hashtext(d::text || s.id::text || 'tu')) % 250),
  round(base.active_users * 1.35)::bigint,
  round(base.active_users * 2.6)::bigint,
  round(base.active_users * 0.78)::bigint
from public.sites s
cross join generate_series(current_date - 89, current_date - 1, interval '1 day') as g(d)
cross join lateral (
  select (
    case when s.id = '11111111-1111-1111-1111-111111111111' then 650 else 280 end
    + (abs(hashtext(d::text || s.id::text || 'au')) % 400)
  )::bigint as active_users
) base;

-- ---------------------------------------------------------------------------
-- Daily search metrics - Google (full metrics) and Bing (clicks/impressions)
-- ---------------------------------------------------------------------------
-- Google: ctr and average_position populated.
insert into public.search_daily
  (site_id, engine, metric_date, clicks, impressions, ctr, average_position)
select
  s.id,
  'google',
  d::date,
  c.clicks,
  c.impressions,
  round((c.clicks::numeric / nullif(c.impressions, 0)), 4),
  round((6 + (abs(hashtext(d::text || s.id::text || 'pos')) % 1800) / 100.0)::numeric, 1)
from public.sites s
cross join generate_series(current_date - 89, current_date - 1, interval '1 day') as g(d)
cross join lateral (
  select
    imp.impressions,
    round(imp.impressions * (0.03 + (abs(hashtext(d::text || s.id::text || 'r')) % 50) / 1000.0))::bigint as clicks
  from (
    select (
      case when s.id = '11111111-1111-1111-1111-111111111111' then 6000 else 2200 end
      + (abs(hashtext(d::text || s.id::text || 'imp')) % 5000)
    )::bigint as impressions
  ) imp
) c;

-- Bing: only sites with a bing property (site 1). ctr / average_position NULL.
insert into public.search_daily
  (site_id, engine, metric_date, clicks, impressions, ctr, average_position)
select
  s.id,
  'bing',
  d::date,
  round(imp.impressions * (0.02 + (abs(hashtext(d::text || 'br')) % 40) / 1000.0))::bigint,
  imp.impressions,
  null,
  null
from public.sites s
cross join generate_series(current_date - 89, current_date - 1, interval '1 day') as g(d)
cross join lateral (
  select (900 + (abs(hashtext(d::text || s.id::text || 'bimp')) % 1500))::bigint as impressions
) imp
where s.bing_site_url is not null;

-- ---------------------------------------------------------------------------
-- Sync history - recent scheduled runs per enabled integration
-- ---------------------------------------------------------------------------
insert into public.sync_runs
  (site_id, source, trigger_type, range_start, range_end, started_at, finished_at,
   status, rows_fetched, rows_written, duration_ms, error_code, error_message, metadata)
select
  i.site_id,
  i.source,
  'scheduled',
  (current_date - n - 10),
  (current_date - n - 1),
  ((current_date - n) + time '04:05')::timestamptz,
  ((current_date - n) + time '04:05')::timestamptz + make_interval(secs => run.duration_ms / 1000.0),
  run.status,
  run.rows_fetched,
  run.rows_written,
  run.duration_ms,
  run.error_code,
  run.error_message,
  '{}'::jsonb
from public.integration_status i
cross join generate_series(0, 5) as g(n)
cross join lateral (
  select
    -- site 2 / ga4 fails on its two most recent runs (drives a critical card)
    case
      when i.site_id = '22222222-2222-2222-2222-222222222222'
           and i.source = 'ga4' and n <= 1 then 'failed'
      else 'success'
    end as status,
    8 + (abs(hashtext(i.site_id::text || i.source || n::text)) % 6) as rows_fetched,
    8 + (abs(hashtext(i.site_id::text || i.source || n::text || 'w')) % 6) as rows_written,
    1200 + (abs(hashtext(i.site_id::text || i.source || n::text || 'd')) % 4000) as duration_ms
) base
cross join lateral (
  select
    base.status,
    case when base.status = 'failed' then 0 else base.rows_fetched end as rows_fetched,
    case when base.status = 'failed' then 0 else base.rows_written end as rows_written,
    base.duration_ms,
    case when base.status = 'failed' then 'provider_error' else null end as error_code,
    case when base.status = 'failed'
         then 'Google Analytics API returned 403 (check property access)'
         else null end as error_message
) run
where i.enabled = true;

-- ---------------------------------------------------------------------------
-- Integration status - reflect a realistic mix of health states
-- ---------------------------------------------------------------------------
-- Healthy integrations: recent success, no failures.
update public.integration_status i
set
  last_attempt_at = now() - interval '6 hours',
  last_success_at = now() - interval '6 hours',
  last_status = 'success',
  last_duration_ms = 2400,
  last_rows_fetched = 10,
  last_rows_written = 10,
  consecutive_failures = 0,
  last_error_code = null,
  last_error_message = null,
  next_run_at = (current_date + 1) + time '04:05'
where i.enabled = true
  and not (i.site_id = '22222222-2222-2222-2222-222222222222' and i.source = 'ga4');

-- Critical integration: site 2 GA4 - two consecutive failures, stale success.
update public.integration_status i
set
  last_attempt_at = now() - interval '5 hours',
  last_success_at = now() - interval '3 days',
  last_status = 'failed',
  last_duration_ms = 800,
  last_rows_fetched = 0,
  last_rows_written = 0,
  consecutive_failures = 2,
  last_error_code = 'provider_error',
  last_error_message = 'Google Analytics API returned 403 (check property access)',
  next_run_at = (current_date + 1) + time '04:05'
where i.site_id = '22222222-2222-2222-2222-222222222222' and i.source = 'ga4';
