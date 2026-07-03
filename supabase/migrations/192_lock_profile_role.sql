-- SECURITY: lock profiles.role against self-elevation.
--
-- The "Users can update own profile" UPDATE policy (001_core_schema.sql) has USING (id = auth.uid())
-- and NO with_check / column guard, so any authenticated user could set their own role='admin' via
-- the public PostgREST API. Every admin gate in the app (requireAdmin, resolveCurrentClient's admin
-- mode, the /admin pages) trusts profiles.role, so this was a straight privilege-escalation path to
-- every admin surface — including cross-client writes to live Google Business Profiles.
--
-- Fix: a BEFORE UPDATE trigger that rejects any role change unless it comes from the service role
-- (server code using the admin client) or a direct database owner session (SQL editor / migrations).
-- A trigger, unlike WITH CHECK, also covers future policies that might loosen the row filter.

create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    if not (
      coalesce(auth.role(), '') = 'service_role'
      or current_user in ('postgres', 'supabase_admin')
    ) then
      raise exception 'Profile roles can only be changed by the server.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_role on public.profiles;
create trigger protect_profile_role
  before update on public.profiles
  for each row execute function public.protect_profile_role();
