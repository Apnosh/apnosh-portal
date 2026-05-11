-- ─────────────────────────────────────────────────────────────
-- 103_shoots.sql
--
-- Backbone for the videographer/photographer field surface.
--
-- A "shoot" is one on-location session. Tied to a client, scheduled
-- in time, owned by a lead crew member, and optionally tied to a
-- brief or quote it fulfills. Captures the minimum we need to power
-- /work/shoots: list, detail, brief, location, status.
--
-- Crew assignments are separate rows (a shoot can have a primary
-- videographer + a photographer + an assistant).
-- ─────────────────────────────────────────────────────────────

do $$
begin
  if not exists (select 1 from pg_type where typname = 'shoot_status') then
    create type shoot_status as enum (
      'planned',      -- scheduled, brief incoming
      'briefed',      -- crew has the shot list
      'in_progress',  -- shoot day
      'wrapped',      -- footage captured, awaiting upload
      'uploaded',     -- raw delivered to editor
      'completed',
      'canceled'
    );
  end if;
end$$;

create table if not exists shoots (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references clients(id) on delete cascade,
  title           text not null,
  scheduled_at    timestamptz not null,
  duration_min    int default 90,
  status          shoot_status not null default 'planned',

  location_name   text,
  location_addr   text,
  location_lat    numeric(9,6),
  location_lng    numeric(9,6),
  location_notes  text,

  brief           jsonb not null default '{}'::jsonb,
  shot_list       jsonb not null default '[]'::jsonb,
  mood_board_urls text[] default '{}',

  contact_name    text,
  contact_phone   text,

  lead_person_id  uuid references auth.users(id),
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  wrapped_at      timestamptz,
  uploaded_at     timestamptz
);

create index if not exists shoots_client_idx        on shoots (client_id);
create index if not exists shoots_lead_idx          on shoots (lead_person_id) where lead_person_id is not null;
create index if not exists shoots_scheduled_idx     on shoots (scheduled_at);
create index if not exists shoots_status_open_idx   on shoots (status)
  where status in ('planned','briefed','in_progress','wrapped');

-- Crew (M:M between a shoot and the people working it).
create table if not exists shoot_crew (
  id            uuid primary key default gen_random_uuid(),
  shoot_id      uuid not null references shoots(id) on delete cascade,
  person_id     uuid not null references auth.users(id) on delete cascade,
  role          role_capability not null
                  check (role in ('videographer','photographer','editor','influencer')),
  is_lead       boolean not null default false,
  invited_at    timestamptz not null default now(),
  accepted_at   timestamptz,
  declined_at   timestamptz,
  payout_cents  int,                -- gig pay; null for roster contractors
  unique (shoot_id, person_id, role)
);

create index if not exists shoot_crew_person_idx   on shoot_crew (person_id) where declined_at is null;
create index if not exists shoot_crew_shoot_idx    on shoot_crew (shoot_id);

-- Uploads: every file produced for a shoot. Could be raw clips, stills,
-- photos. Storage URL points at a Supabase Storage object.
create table if not exists shoot_uploads (
  id           uuid primary key default gen_random_uuid(),
  shoot_id     uuid not null references shoots(id) on delete cascade,
  uploaded_by  uuid not null references auth.users(id),
  storage_url  text not null,
  file_name    text not null,
  file_size    bigint,
  mime_type    text,
  kind         text not null default 'raw' check (kind in ('raw','still','reference','final')),
  uploaded_at  timestamptz not null default now()
);

create index if not exists shoot_uploads_shoot_idx on shoot_uploads (shoot_id);

-- RLS: a person sees a shoot if they're crew on it OR admin/strategist.
-- Clients see their own shoots through a separate read-only policy.
alter table shoots          enable row level security;
alter table shoot_crew      enable row level security;
alter table shoot_uploads   enable row level security;

drop policy if exists "crew read shoots"         on shoots;
drop policy if exists "strategist read shoots"   on shoots;
drop policy if exists "admin all shoots"         on shoots;
drop policy if exists "client read own shoots"   on shoots;

create policy "crew read shoots" on shoots for select using (
  exists (
    select 1 from shoot_crew sc
    where sc.shoot_id = shoots.id and sc.person_id = auth.uid()
  )
);
create policy "strategist read shoots" on shoots for select using (
  has_capability('strategist')
);
create policy "admin all shoots" on shoots for all
  using (is_admin()) with check (is_admin());
create policy "client read own shoots" on shoots for select using (
  exists (
    select 1 from role_assignments ra
    where ra.person_id = auth.uid()
      and ra.client_id = shoots.client_id
      and ra.role in ('client_owner','client_manager')
      and ra.ended_at is null
  )
);

drop policy if exists "self crew rows"           on shoot_crew;
drop policy if exists "admin all crew"           on shoot_crew;
drop policy if exists "strategist read crew"     on shoot_crew;

create policy "self crew rows" on shoot_crew for select using (
  person_id = auth.uid()
);
create policy "strategist read crew" on shoot_crew for select using (
  has_capability('strategist')
);
create policy "admin all crew" on shoot_crew for all
  using (is_admin()) with check (is_admin());

drop policy if exists "crew read uploads"        on shoot_uploads;
drop policy if exists "crew write uploads"       on shoot_uploads;
drop policy if exists "admin all uploads"        on shoot_uploads;

create policy "crew read uploads" on shoot_uploads for select using (
  exists (
    select 1 from shoot_crew sc
    where sc.shoot_id = shoot_uploads.shoot_id and sc.person_id = auth.uid()
  )
);
create policy "crew write uploads" on shoot_uploads for insert with check (
  uploaded_by = auth.uid()
  and exists (
    select 1 from shoot_crew sc
    where sc.shoot_id = shoot_uploads.shoot_id and sc.person_id = auth.uid()
  )
);
create policy "admin all uploads" on shoot_uploads for all
  using (is_admin()) with check (is_admin());

comment on table shoots is
  'On-location video/photo session. Powers /work/shoots for the field crew and feeds asset pipeline downstream.';
comment on table shoot_crew is
  'Who is working a shoot. One row per (shoot, person, role). is_lead flags the point person.';
comment on table shoot_uploads is
  'Field-uploaded files attached to a shoot. Phase-0 cut: URL + metadata only; storage is Supabase Storage.';
