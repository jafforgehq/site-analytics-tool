-- 0003_mfa_enrollment_guard.sql
-- Hardening: close the "enroll a new factor from an aal1 session" MFA bypass.
--
-- Threat: an attacker who only has the password reaches an aal1 session. By
-- default GoTrue lets an aal1 session enroll (and verify) a NEW factor, which
-- would elevate to aal2 and sidestep the existing TOTP factor entirely. It
-- could also DELETE the existing factor first to clear the way.
--
-- Guard: on auth.mfa_factors, refuse to
--   * INSERT a new factor when the user already has a verified factor, or
--   * DELETE a verified factor,
-- unless the session is provably aal2.
--
-- Recovery: the guard exempts the `postgres` / `supabase_admin` roles, so the
-- Supabase SQL editor can always remove a factor if a device is lost:
--   delete from auth.mfa_factors where user_id = '<your-uuid>';
-- then sign in and re-enroll.
--
-- Note: GoTrue's database connection does not expose the request JWT claims, so
-- the aal check fails closed for API-initiated changes. Net effect for the app:
-- the in-app "add / remove additional authenticator" actions won't work and
-- must be done from the SQL editor - an acceptable trade for a single-admin
-- tool. First-time enrollment (no verified factor yet) is always allowed.

create or replace function public.guard_mfa_factor_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  is_aal2 boolean;
begin
  -- Privileged manual administration (SQL editor / dashboard as postgres) is
  -- always allowed so recovery is possible. GoTrue runs as
  -- supabase_auth_admin, which is intentionally NOT exempt.
  if current_user in ('postgres', 'supabase_admin') then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  is_aal2 :=
    coalesce(
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'aal',
      ''
    ) = 'aal2';

  if tg_op = 'INSERT' then
    if not is_aal2 and exists (
      select 1
      from auth.mfa_factors f
      where f.user_id = new.user_id and f.status = 'verified'
    ) then
      raise exception
        'Enrolling an additional MFA factor requires a fully (aal2) verified session'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if not is_aal2 and old.status = 'verified' then
      raise exception
        'Removing a verified MFA factor requires a fully (aal2) verified session'
        using errcode = '42501';
    end if;
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_mfa_factor_insert on auth.mfa_factors;
create trigger guard_mfa_factor_insert
  before insert on auth.mfa_factors
  for each row execute function public.guard_mfa_factor_change();

drop trigger if exists guard_mfa_factor_delete on auth.mfa_factors;
create trigger guard_mfa_factor_delete
  before delete on auth.mfa_factors
  for each row execute function public.guard_mfa_factor_change();
