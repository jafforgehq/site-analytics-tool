-- 0001_initial_schema.sql
-- Core schema for the Site Analytics dashboard.
-- All timestamps are UTC (timestamptz). Daily metrics use SQL `date`.

-- ---------------------------------------------------------------------------
-- Private administrator allowlist
-- ---------------------------------------------------------------------------
-- The `private` schema is never exposed to the browser. Membership in
-- private.admin_users is the sole source of truth for "is this user an admin".

create schema if not exists private;

create table if not exists private.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Lock the private schema away from browser roles entirely.
revoke all on schema private from anon, authenticated;
revoke all on all tables in schema private from anon, authenticated;

-- Safe admin check. SECURITY DEFINER with an empty search_path so it cannot be
-- hijacked, and so authenticated users can call it without reading the private
-- table directly.
create or replace function public.is_portfolio_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.admin_users au
    where au.user_id = auth.uid()
  );
$$;

revoke all on function public.is_portfolio_admin() from public;
grant execute on function public.is_portfolio_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Shared helper: keep updated_at fresh on UPDATE
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Websites
-- ---------------------------------------------------------------------------
create table public.sites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  domain text not null unique,
  website_url text not null,

  -- Exact provider identifiers. gsc_property is e.g. 'sc-domain:example.com'
  -- for domain properties, or the full URL for URL-prefix properties.
  gsc_property text,
  ga4_property_id text,
  bing_site_url text,

  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger sites_set_updated_at
  before update on public.sites
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Daily Google Analytics 4 metrics
-- ---------------------------------------------------------------------------
create table public.analytics_daily (
  site_id uuid not null references public.sites (id) on delete cascade,
  metric_date date not null,

  active_users bigint not null default 0,
  total_users bigint not null default 0,
  sessions bigint not null default 0,
  screen_page_views bigint not null default 0,
  engaged_sessions bigint not null default 0,

  updated_at timestamptz not null default now(),

  primary key (site_id, metric_date)
);

create index analytics_daily_metric_date_idx
  on public.analytics_daily (metric_date desc);

-- ---------------------------------------------------------------------------
-- Daily Google / Bing search metrics
-- ---------------------------------------------------------------------------
-- NULL ctr / average_position means "not provided by the API" - the UI must
-- render these as an em dash, never as zero.
create table public.search_daily (
  site_id uuid not null references public.sites (id) on delete cascade,
  engine text not null check (engine in ('google', 'bing')),
  metric_date date not null,

  clicks bigint not null default 0,
  impressions bigint not null default 0,
  ctr numeric,
  average_position numeric,

  updated_at timestamptz not null default now(),

  primary key (site_id, engine, metric_date)
);

create index search_daily_metric_date_idx
  on public.search_daily (metric_date desc);

-- ---------------------------------------------------------------------------
-- Sync history (one row per attempt)
-- ---------------------------------------------------------------------------
create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),

  site_id uuid not null references public.sites (id) on delete cascade,
  source text not null check (source in ('gsc', 'ga4', 'bing')),
  trigger_type text not null check (
    trigger_type in ('scheduled', 'manual', 'backfill')
  ),

  requested_by uuid references auth.users (id) on delete set null,

  range_start date,
  range_end date,

  started_at timestamptz not null default now(),
  finished_at timestamptz,

  status text not null default 'running' check (
    status in ('running', 'success', 'partial', 'failed')
  ),

  rows_fetched integer not null default 0,
  rows_written integer not null default 0,
  duration_ms integer,

  error_code text,
  error_message text,

  metadata jsonb not null default '{}'::jsonb
);

create index sync_runs_site_source_started_idx
  on public.sync_runs (site_id, source, started_at desc);

create index sync_runs_status_started_idx
  on public.sync_runs (status, started_at desc);

-- Only one running sync per (site, source) at a time. The sync framework
-- relies on this to return 409 instead of starting a duplicate run.
create unique index sync_runs_one_running_per_integration_idx
  on public.sync_runs (site_id, source)
  where status = 'running';

-- ---------------------------------------------------------------------------
-- Current integration status (one row per site+source)
-- ---------------------------------------------------------------------------
create table public.integration_status (
  site_id uuid not null references public.sites (id) on delete cascade,
  source text not null check (source in ('gsc', 'ga4', 'bing')),

  enabled boolean not null default true,

  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_status text check (
    last_status in ('running', 'success', 'partial', 'failed')
  ),

  last_duration_ms integer,
  last_rows_fetched integer not null default 0,
  last_rows_written integer not null default 0,

  consecutive_failures integer not null default 0,

  last_error_code text,
  last_error_message text,

  next_run_at timestamptz,
  stale_after_hours integer not null default 36,

  updated_at timestamptz not null default now(),

  primary key (site_id, source)
);

create index integration_status_last_success_idx
  on public.integration_status (last_success_at);

create trigger integration_status_set_updated_at
  before update on public.integration_status
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Auto-provision integration_status rows when a site is created
-- ---------------------------------------------------------------------------
-- An integration is enabled only if its provider identifier is configured.
-- Unconfigured integrations are created disabled (not treated as failing).
create or replace function public.seed_integration_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.integration_status (site_id, source, enabled)
  values
    (new.id, 'gsc', new.gsc_property is not null),
    (new.id, 'ga4', new.ga4_property_id is not null),
    (new.id, 'bing', new.bing_site_url is not null)
  on conflict (site_id, source) do nothing;
  return new;
end;
$$;

create trigger sites_seed_integration_status
  after insert on public.sites
  for each row execute function public.seed_integration_status();
