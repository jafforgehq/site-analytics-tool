-- 0006_search_breakdowns.sql
-- Per-day top queries and top pages from Search Console (engine-aware so Bing
-- can be added later). Bounded volume: the sync stores only the top rows per
-- day, never every possible query/page combination.

create table public.search_query_daily (
  site_id uuid not null references public.sites (id) on delete cascade,
  engine text not null check (engine in ('google', 'bing')),
  metric_date date not null,
  query text not null,

  clicks bigint not null default 0,
  impressions bigint not null default 0,
  ctr numeric,
  average_position numeric,

  updated_at timestamptz not null default now(),

  primary key (site_id, engine, metric_date, query)
);

create index search_query_daily_site_date_idx
  on public.search_query_daily (site_id, metric_date desc);

create table public.search_page_daily (
  site_id uuid not null references public.sites (id) on delete cascade,
  engine text not null check (engine in ('google', 'bing')),
  metric_date date not null,
  page text not null,

  clicks bigint not null default 0,
  impressions bigint not null default 0,
  ctr numeric,
  average_position numeric,

  updated_at timestamptz not null default now(),

  primary key (site_id, engine, metric_date, page)
);

create index search_page_daily_site_date_idx
  on public.search_page_daily (site_id, metric_date desc);

-- RLS: same read model as the rest - admin + aal2 only, no browser writes.
alter table public.search_query_daily enable row level security;
alter table public.search_page_daily enable row level security;

create policy "search_query_daily admin select"
  on public.search_query_daily as permissive for select to authenticated
  using (public.is_portfolio_admin());
create policy "search_query_daily require aal2"
  on public.search_query_daily as restrictive for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2');

create policy "search_page_daily admin select"
  on public.search_page_daily as permissive for select to authenticated
  using (public.is_portfolio_admin());
create policy "search_page_daily require aal2"
  on public.search_page_daily as restrictive for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2');

-- Grants (project created with auto-expose off): read for admins, DML for the
-- Edge Functions' service_role.
grant select on public.search_query_daily, public.search_page_daily
  to authenticated;
grant select, insert, update, delete
  on public.search_query_daily, public.search_page_daily
  to service_role;
