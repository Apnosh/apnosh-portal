-- ============================================================
-- Migration 078: Daily Specials / Deals
-- ============================================================
-- Recurring time-windowed deals shown on the customer's site.
-- Different from `client_updates` (one-off promos with codes/expiry):
-- specials are persistent combos like "Happy Hour 3-5pm" that
-- run until the client turns them off.
--
-- Yellow Bee's PDF asked for redesigned daily specials with photos
-- and deal-as-header. This table is the source of truth.
-- ============================================================

create table if not exists client_specials (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,

  -- Display
  title text not null,                       -- "Happy Hour Special" or just the deal headline
  tagline text,                              -- short description / hook line
  time_window text,                          -- "3PM – 5PM Daily" / "Opening – 11AM"
  price text,                                -- "$12.99" or "+$1.99" -- free-form, optional
  save_label text,                           -- "Save $3+" -- optional
  includes text[] not null default '{}',     -- bullet list of what's included
  photo_url text,                            -- optional hero photo
  display_order integer not null default 0,

  -- Availability
  is_active boolean not null default true,   -- off without deleting
  -- empty array = all locations; specific ids = only those
  available_location_ids uuid[] not null default '{}',

  -- Audit
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_edited_by uuid references auth.users(id)
);

create index if not exists idx_specials_client on client_specials(client_id);
create index if not exists idx_specials_client_active
  on client_specials(client_id) where is_active;

-- Auto-update updated_at
create or replace function client_specials_set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists client_specials_updated_at on client_specials;
create trigger client_specials_updated_at
  before update on client_specials
  for each row execute function client_specials_set_updated_at();

-- ── RLS ────────────────────────────────────────────────────
alter table client_specials enable row level security;

create policy "admins manage client_specials"
  on client_specials for all using (is_admin()) with check (is_admin());

create policy "clients manage their specials"
  on client_specials for all using (
    client_id in (
      select client_id from client_users where auth_user_id = auth.uid()
    )
  ) with check (
    client_id in (
      select client_id from client_users where auth_user_id = auth.uid()
    )
  );

notify pgrst, 'reload schema';
