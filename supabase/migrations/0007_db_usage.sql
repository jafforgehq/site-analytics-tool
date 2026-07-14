-- 0007_db_usage.sql
-- Admin-only database-usage snapshot so the dashboard can show how close the
-- project is to its plan's database-size limit (Free = 500 MB, Pro = 8 GB).
--
-- Returns sizes and catalog row *estimates* only - never table data - so it is
-- safe to surface in the UI. RPCs are not protected by RLS, so the function
-- self-guards with the same trust the tables require: a portfolio admin on an
-- MFA-verified (aal2) session. auth.uid()/auth.jwt() reflect the *calling*
-- user even though the function is SECURITY DEFINER.

create or replace function public.get_db_usage()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.is_portfolio_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'mfa required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'captured_at', now(),
    'database_bytes', pg_database_size(current_database()),
    'tables', coalesce(
      (
        select jsonb_agg(t order by (t ->> 'total_bytes')::bigint desc)
        from (
          select jsonb_build_object(
            'name', c.relname,
            'total_bytes', pg_total_relation_size(c.oid),
            'row_estimate', greatest(c.reltuples, 0)::bigint
          ) as t
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public'
            and c.relkind = 'r'
        ) tbl
      ),
      '[]'::jsonb
    )
  )
  into result;

  return result;
end;
$$;

revoke all on function public.get_db_usage() from public;
revoke all on function public.get_db_usage() from anon;
grant execute on function public.get_db_usage() to authenticated;
