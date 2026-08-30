-- 0009_v2_features.sql
-- V2: goals, chart annotations, tracked queries, and uptime checks.
--
-- Access model is identical to the rest of the schema (see 0002_rls.sql):
--   * Browser reads: portfolio admin on an MFA-verified (aal2) session.
--   * Browser writes: none. All writes go through Edge Functions
--     (manage-portfolio, scheduled-uptime) using privileged credentials.

-- ---------------------------------------------------------------------------
-- Site goals: "trailing 30-day <metric> should reach <target> by <date>"
-- ---------------------------------------------------------------------------
create table public.site_goals (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,

  metric text not null check (metric in ('sessions', 'clicks')),
  target_value bigint not null check (target_value > 0),
  target_date date not null,
  note text check (char_length(note) <= 200),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index site_goals_site_idx on public.site_goals (site_id, target_date);

create trigger site_goals_set_updated_at
  before update on public.site_goals
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Annotations: events rendered as markers on charts. site_id NULL = portfolio
-- wide (e.g. a Google algorithm update).
-- ---------------------------------------------------------------------------
create table public.annotations (
  id uuid primary key default gen_random_uuid(),
  site_id uuid references public.sites (id) on delete cascade,

  event_date date not null,
  label text not null check (char_length(label) between 1 and 80),
  kind text not null default 'other'
    check (kind in ('deploy', 'content', 'seo', 'other')),

  created_at timestamptz not null default now()
);

create index annotations_site_date_idx
  on public.annotations (site_id, event_date desc);

-- ---------------------------------------------------------------------------
-- Tracked queries: starred Search Console queries whose position history the
-- dashboard charts from search_query_daily. No new provider data is fetched.
-- ---------------------------------------------------------------------------
create table public.tracked_queries (
  site_id uuid not null references public.sites (id) on delete cascade,
  query text not null check (char_length(query) between 1 and 200),
  created_at timestamptz not null default now(),

  primary key (site_id, query)
);

-- ---------------------------------------------------------------------------
-- Uptime checks: one row per scheduled probe of a site's public URL.
-- Retention is handled by the scheduled-uptime function itself (90 days).
-- ---------------------------------------------------------------------------
create table public.uptime_checks (
  site_id uuid not null references public.sites (id) on delete cascade,
  checked_at timestamptz not null default now(),

  ok boolean not null,
  status_code integer,
  latency_ms integer,
  error text,

  primary key (site_id, checked_at)
);

create index uptime_checks_checked_idx
  on public.uptime_checks (checked_at desc);

-- ---------------------------------------------------------------------------
-- RLS + grants (same pattern as 0002/0006)
-- ---------------------------------------------------------------------------
alter table public.site_goals enable row level security;
alter table public.annotations enable row level security;
alter table public.tracked_queries enable row level security;
alter table public.uptime_checks enable row level security;

create policy "site_goals admin select"
  on public.site_goals as permissive for select to authenticated
  using (public.is_portfolio_admin());
create policy "site_goals require aal2"
  on public.site_goals as restrictive for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2');

create policy "annotations admin select"
  on public.annotations as permissive for select to authenticated
  using (public.is_portfolio_admin());
create policy "annotations require aal2"
  on public.annotations as restrictive for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2');

create policy "tracked_queries admin select"
  on public.tracked_queries as permissive for select to authenticated
  using (public.is_portfolio_admin());
create policy "tracked_queries require aal2"
  on public.tracked_queries as restrictive for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2');

create policy "uptime_checks admin select"
  on public.uptime_checks as permissive for select to authenticated
  using (public.is_portfolio_admin());
create policy "uptime_checks require aal2"
  on public.uptime_checks as restrictive for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2');

grant select on
  public.site_goals,
  public.annotations,
  public.tracked_queries,
  public.uptime_checks
to authenticated;

revoke all on
  public.site_goals,
  public.annotations,
  public.tracked_queries,
  public.uptime_checks
from anon;

grant select, insert, update, delete on
  public.site_goals,
  public.annotations,
  public.tracked_queries,
  public.uptime_checks
to service_role;

-- ---------------------------------------------------------------------------
-- Hourly uptime cron (same Vault-based pattern as 0005_cron_jobs.sql)
-- ---------------------------------------------------------------------------
create or replace function public.invoke_scheduled_uptime()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url
  from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'automation_secret';

  if v_url is null or v_secret is null then
    raise exception 'Missing Vault secret project_url or automation_secret';
  end if;

  perform net.http_post(
    url := v_url || '/functions/v1/scheduled-uptime',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Automation-Secret', v_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;

revoke all on function public.invoke_scheduled_uptime() from public;
revoke all on function public.invoke_scheduled_uptime() from anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'site-analytics-uptime') then
    perform cron.unschedule('site-analytics-uptime');
  end if;
end;
$$;

select cron.schedule(
  'site-analytics-uptime', '45 * * * *',
  $$select public.invoke_scheduled_uptime()$$
);
