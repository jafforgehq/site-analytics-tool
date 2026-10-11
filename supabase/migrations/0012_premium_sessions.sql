-- 0012_premium_sessions.sql
-- Mediavine Journey counts "premium" sessions (US, UK, Canada, Australia),
-- not all sessions. The GA4 sync now stores that country-filtered count next
-- to the total.
--
-- NULL means "not synced for this day yet" and is distinct from a real zero,
-- so the dashboard never reads missing history as "no premium traffic".

alter table public.analytics_daily
  add column if not exists premium_sessions bigint;
