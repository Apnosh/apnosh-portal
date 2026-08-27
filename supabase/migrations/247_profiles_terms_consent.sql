-- 247: terms consent on profiles, recorded at sign-up.
-- Sign-up sends terms_accepted_at + terms_version in the auth metadata; the
-- trigger copies them (and phone) onto the profile row. Self-contained: safe
-- to run whether or not 246 ran first.
alter table profiles add column if not exists phone text;
alter table profiles add column if not exists terms_accepted_at timestamptz;
alter table profiles add column if not exists terms_version text;

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, phone, terms_accepted_at, terms_version)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'avatar_url', null),
    coalesce(new.raw_user_meta_data->>'phone', null),
    (new.raw_user_meta_data->>'terms_accepted_at')::timestamptz,
    coalesce(new.raw_user_meta_data->>'terms_version', null)
  );
  return new;
end;
$$ language plpgsql security definer;
