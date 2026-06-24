-- Maps a logged-in auth user to the creator they ARE, so a real creator can
-- sign in and see their own work orders (instead of the admin-only ?creator=
-- preview). Decoupled from vendors on purpose: the seeded pool ids (e.g.
-- 'v_maya') are text, not vendor uuids. When real vendors replace the pool this
-- becomes vendors.person_id and creator_id resolves through the vendor.

create table if not exists creator_logins (
  person_id uuid primary key references auth.users(id) on delete cascade,
  creator_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists creator_logins_creator on creator_logins (creator_id);

alter table creator_logins enable row level security;

do $$ begin
  create policy creator_logins_admin on creator_logins
    for all using (is_admin()) with check (is_admin());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy creator_logins_own on creator_logins
    for select using (person_id = auth.uid());
exception when duplicate_object then null; end $$;
