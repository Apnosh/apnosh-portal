-- 246: the owner's phone on profiles, captured at sign-up.
-- Sign-up now sends phone in the auth metadata; the new-user trigger copies
-- it onto the profile row alongside full_name. Until this runs, phone waits
-- safely in auth.users.raw_user_meta_data (nothing is lost).
alter table profiles add column if not exists phone text;

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, phone)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'avatar_url', null),
    coalesce(new.raw_user_meta_data->>'phone', null)
  );
  return new;
end;
$$ language plpgsql security definer;
