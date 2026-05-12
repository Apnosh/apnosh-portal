-- Team page foundations.
--
-- Extends existing tables rather than building parallel ones:
--   - profiles  → bio, portfolio_url, specialties, availability_status, last_seen_at
--   - role_assignments → is_primary_contact, current_focus
--   - role_capability enum → +social_media_manager, +seo_specialist
--
-- Existing roles already cover the spec's video_editor (use 'editor')
-- and paid_media_specialist (use 'ad_buyer'). Display labels differ
-- in the UI; the underlying capability stays consistent with what the
-- /work surfaces already understand.
--
-- New tables: specialist_activity (for "last did X · 2 days ago"),
-- swap_requests (private client→strategist channel to swap a person
-- off the account).
-- ─────────────────────────────────────────────────────────────────────

-- 1. role_capability enum extensions.
do $$
begin
  if not exists (
    select 1 from pg_type t join pg_enum e on e.enumtypid = t.oid
    where t.typname = 'role_capability' and e.enumlabel = 'social_media_manager'
  ) then
    alter type role_capability add value 'social_media_manager';
  end if;
end$$;

do $$
begin
  if not exists (
    select 1 from pg_type t join pg_enum e on e.enumtypid = t.oid
    where t.typname = 'role_capability' and e.enumlabel = 'seo_specialist'
  ) then
    alter type role_capability add value 'seo_specialist';
  end if;
end$$;

-- 2. profiles: specialist-display columns.
alter table profiles
  add column if not exists bio                 text,
  add column if not exists portfolio_url       text,
  add column if not exists specialties         text[] not null default '{}',
  add column if not exists availability_status text not null default 'available'
    check (availability_status in ('available','limited','full')),
  add column if not exists last_seen_at        timestamptz;

create index if not exists profiles_specialties_idx on profiles using gin (specialties);
create index if not exists profiles_availability_idx on profiles (availability_status);

comment on column profiles.bio is
  '1-2 sentence specialist bio in their own voice. Surfaced on /dashboard/social/team.';
comment on column profiles.specialties is
  'Free-form tags, e.g. {"TikTok native","food photography","Vietnamese-language captions"}.';
comment on column profiles.availability_status is
  'available | limited | full. Drives the marketplace availability filter.';
comment on column profiles.last_seen_at is
  'Stamped on auth events. Drives the "Working now" indicator on the primary contact card.';

-- 3. role_assignments: per-account contact + focus.
alter table role_assignments
  add column if not exists is_primary_contact boolean not null default false,
  add column if not exists current_focus      text;

-- At most one primary contact per (client, role) at a time. A client
-- can have a primary strategist AND a primary social_media_manager —
-- but not two strategists fighting for "primary" on the same account.
-- We constrain via a partial unique index that excludes ended rows.
create unique index if not exists role_assignments_primary_per_client_role
  on role_assignments (client_id, role)
  where is_primary_contact = true and ended_at is null;

comment on column role_assignments.is_primary_contact is
  'When true, this person is the default recipient for "Message your team" threads on this account.';
comment on column role_assignments.current_focus is
  'One-line, what this person is working on right now. Strategist updates it. Surfaces on the primary contact card.';

-- 4. specialist_activity: feed for "last did X" timestamps.
create table if not exists specialist_activity (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id) on delete cascade,
  specialist_id uuid not null references auth.users(id) on delete cascade,
  activity_type text not null
    check (activity_type in (
      'published_post','delivered_reel','shot_photoshoot',
      'wrote_caption','replied_to_dm','launched_boost',
      'replied_to_review','edited_video','published_web_update'
    )),
  reference_id  uuid,                  -- optional FK into posts/assets
  occurred_at   timestamptz not null default now(),
  metadata      jsonb not null default '{}'::jsonb
);

create index if not exists specialist_activity_account_specialist_idx
  on specialist_activity (client_id, specialist_id, occurred_at desc);
create index if not exists specialist_activity_specialist_idx
  on specialist_activity (specialist_id, occurred_at desc);

alter table specialist_activity enable row level security;

drop policy if exists "admin all activity"      on specialist_activity;
drop policy if exists "client reads activity"   on specialist_activity;
drop policy if exists "specialist reads own"    on specialist_activity;

create policy "admin all activity"
  on specialist_activity for all
  using (is_admin()) with check (is_admin());

-- Clients see activity for specialists assigned to their account.
create policy "client reads activity"
  on specialist_activity for select
  using (client_id = current_client_id());

-- A specialist can see their own activity rows regardless of client.
create policy "specialist reads own"
  on specialist_activity for select
  using (specialist_id = auth.uid());

comment on table specialist_activity is
  'Feed of "X did Y on this account at T" rows. Drives the "Last did…" line on team cards.';

-- 5. swap_requests: private client→strategist channel.
create table if not exists swap_requests (
  id                    uuid primary key default gen_random_uuid(),
  client_id             uuid not null references clients(id) on delete cascade,
  current_specialist_id uuid not null references auth.users(id) on delete cascade,
  current_role          role_capability not null,
  requested_by          uuid not null references auth.users(id),
  requested_at          timestamptz not null default now(),
  reason                text,
  reason_tags           text[] not null default '{}',
  status                text not null default 'open'
    check (status in ('open','in_discussion','resolved','withdrawn')),
  resolved_specialist_id uuid references auth.users(id),
  resolved_at           timestamptz,
  resolution_note       text
);

create index if not exists swap_requests_open_idx
  on swap_requests (client_id, status) where status in ('open','in_discussion');
create index if not exists swap_requests_specialist_idx
  on swap_requests (current_specialist_id) where status in ('open','in_discussion');

alter table swap_requests enable row level security;

drop policy if exists "admin all swaps"   on swap_requests;
drop policy if exists "client reads swaps" on swap_requests;
drop policy if exists "client writes swaps" on swap_requests;

create policy "admin all swaps"
  on swap_requests for all
  using (is_admin()) with check (is_admin());

-- Clients see swaps for their account; the swapped person does NOT —
-- the spec explicitly says they shouldn't be notified.
create policy "client reads swaps"
  on swap_requests for select
  using (client_id = current_client_id());

create policy "client writes swaps"
  on swap_requests for insert
  with check (client_id = current_client_id() and requested_by = auth.uid());

comment on table swap_requests is
  'Private record of a client asking to replace a specialist. Visible to the client and admins; never to the specialist being swapped.';
