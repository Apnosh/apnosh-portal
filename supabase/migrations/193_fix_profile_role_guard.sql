-- SECURITY FIX for migration 192, which was a no-op.
--
-- 192 defined protect_profile_role() as SECURITY DEFINER. A definer function runs as its OWNER
-- (postgres), so inside the trigger current_user is ALWAYS 'postgres' — which the guard exempts.
-- The trigger therefore never blocked anyone, and the self-elevation hole stayed open. (Verified: a
-- write posing as an authenticated user was still ALLOWED.)
--
-- Fix: redefine as SECURITY INVOKER so the trigger sees the REAL caller. Then:
--   authenticated user  -> current_user='authenticated', auth.role()='authenticated' -> BLOCKED
--   app server          -> auth.role()='service_role'                                -> allowed
--   migrations / SQL     -> current_user in (postgres, supabase_admin)                -> allowed
-- The extra DB roles in the exempt list are belt-and-suspenders for direct (non-PostgREST) server
-- connections where auth.role() may be empty.

create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    if not (
      coalesce(auth.role(), '') = 'service_role'
      or current_user in ('postgres', 'supabase_admin', 'service_role', 'supabase_auth_admin')
    ) then
      raise exception 'Profile roles can only be changed by the server.';
    end if;
  end if;
  return new;
end;
$$;

-- create or replace keeps the existing trigger binding; recreate defensively in case 192 was partial.
drop trigger if exists protect_profile_role on public.profiles;
create trigger protect_profile_role
  before update on public.profiles
  for each row execute function public.protect_profile_role();
