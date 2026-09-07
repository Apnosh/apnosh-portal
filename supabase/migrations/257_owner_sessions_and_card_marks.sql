-- 257: owner_sessions — the log of an owner actually being here.
--
-- The portal knew when STAFF were last seen (profiles.last_seen_at, read by get-team) and
-- nothing at all about the owner. So "does this business use what it pays for?" had no
-- answer: no weeks-active, no comeback rate, nothing behind a churn call except a hunch.
-- One row per client + person + day, written from the shell every time a screen changes.
-- Cheap on purpose: a day, a first and last touch, and how many screens they moved through.
--
-- Tenancy: keyed on client_id (no business_id). Applied by hand in the Supabase SQL editor.

create table if not exists owner_sessions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  user_id uuid not null,                                            -- auth.users id of the person looking
  seen_on date not null,                                            -- their day, in UTC
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  screens integer not null default 1,                               -- screens they moved through that day
  unique (client_id, user_id, seen_on)
);
create index if not exists owner_sessions_client_day on owner_sessions (client_id, seen_on desc);

-- The whole write, atomically, in one round trip: today's row or one more screen on it.
-- Deliberately NOT security definer — it is called with the service role from
-- /api/dashboard/seen, after that route has checked the person belongs to the client.
create or replace function owner_seen(p_client_id uuid, p_user_id uuid)
returns void
language sql
as $$
  insert into owner_sessions (client_id, user_id, seen_on, first_seen_at, last_seen_at, screens)
  values (p_client_id, p_user_id, (now() at time zone 'utc')::date, now(), now(), 1)
  on conflict (client_id, user_id, seen_on)
  do update set last_seen_at = now(), screens = owner_sessions.screens + 1;
$$;

alter table owner_sessions enable row level security;
do $$ begin
  create policy owner_sessions_admin on owner_sessions
    for all using (is_admin()) with check (is_admin());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy owner_sessions_client_read on owner_sessions
    for select using (
      exists (select 1 from client_users cu where cu.client_id = owner_sessions.client_id and cu.auth_user_id = auth.uid())
    );
exception when duplicate_object then null; end $$;

-- ── proof cards: did the win get looked at? ───────────────────────────────────
-- proof_cards has carried read_at since 249, but nothing recorded that a card was OPENED
-- (expanded) or SHARED. Those are the two things that say a win landed. Added here so the
-- love read can count them; read_at is repeated with "if not exists" for any database whose
-- proof_cards predates it.
alter table proof_cards add column if not exists read_at timestamptz;
alter table proof_cards add column if not exists opened_at timestamptz;
alter table proof_cards add column if not exists shared_at timestamptz;
