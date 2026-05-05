-- 082_client_moodboard.sql
-- Persistent inspiration board per client. AMs and designers add
-- inspirational sites/articles/screenshots over time; bespoke
-- generation + brief composition automatically pull from this list
-- so quality compounds with every iteration.

create table if not exists client_moodboard_items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,

  -- The reference itself
  url text,                       -- https URL of inspiration site / article
  image_url text,                 -- optional screenshot or pasted image (Supabase Storage URL)
  title text,                     -- short label
  notes text,                     -- why this is here, what to study from it
  tags text[],                    -- e.g. ['typography','editorial','dark']

  -- Provenance
  added_by uuid references auth.users(id) on delete set null,
  added_at timestamptz not null default now(),

  -- Soft-pin: items the AM wants to bias generation strongly toward
  pinned boolean not null default false
);

create index if not exists client_moodboard_client_idx
  on client_moodboard_items(client_id, pinned desc, added_at desc);

comment on table client_moodboard_items is
  'Inspiration board per client. Used by bespoke generation + brief composition.';

alter table client_moodboard_items enable row level security;

drop policy if exists "moodboard: admin all" on client_moodboard_items;
create policy "moodboard: admin all" on client_moodboard_items
  for all
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'))
  with check (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

notify pgrst, 'reload schema';
