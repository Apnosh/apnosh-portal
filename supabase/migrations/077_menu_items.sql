-- ============================================================
-- Migration 077: Menu Items
-- ============================================================
-- The structured menu for each restaurant. Replaces the menu items
-- being hardcoded in customer site templates (e.g. Yellow Bee's
-- src/_data/menu.json) -- this lets clients self-serve their own
-- menu changes (price updates, add/remove items, photo swaps)
-- without filing a change request.
--
-- Existing client_updates of type 'menu_item' announce a NEW item
-- (broadcast to social etc.). This table is the source of truth
-- for what's currently on the menu.
--
-- Categories are free-form strings ('Banh Mi', 'Boba', 'Espresso',
-- 'Sauces', 'Toppings', 'Milk Options') so clients can structure
-- their menu however they want.
--
-- Modifiers (sauces, toppings, milk options) are also rows in this
-- table -- they just have kind='modifier' and usually a small or
-- null price. Keeping them in one table keeps the editor uniform.
-- ============================================================

create table if not exists menu_items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,

  -- Grouping
  category text not null,                  -- 'Banh Mi', 'Boba', etc. (free-form)
  kind text not null default 'item' check (kind in ('item', 'modifier')),

  -- Display
  name text not null,
  description text,                         -- optional short description
  price_cents integer,                      -- null when there's no price (e.g. plain bagel)
  photo_url text,                           -- direct URL; future: brand_assets ref
  display_order integer not null default 0, -- per-category sort

  -- Availability
  is_available boolean not null default true,    -- can be turned off without deleting
  is_featured boolean not null default false,    -- for "showcase Pandan Matcha Latte"
  -- empty array = available at all locations; specific ids = only those
  available_location_ids uuid[] not null default '{}',

  -- Audit
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_edited_by uuid references auth.users(id)
);

create index if not exists idx_menu_items_client on menu_items(client_id);
create index if not exists idx_menu_items_client_category on menu_items(client_id, category);
create index if not exists idx_menu_items_featured on menu_items(client_id) where is_featured;

-- Auto-update updated_at on changes
create or replace function menu_items_set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists menu_items_updated_at on menu_items;
create trigger menu_items_updated_at
  before update on menu_items
  for each row execute function menu_items_set_updated_at();

-- ── RLS ────────────────────────────────────────────────────
alter table menu_items enable row level security;

create policy "admins manage menu_items"
  on menu_items for all using (is_admin()) with check (is_admin());

create policy "clients manage their menu_items"
  on menu_items for all using (
    client_id in (
      select client_id from client_users where auth_user_id = auth.uid()
    )
  ) with check (
    client_id in (
      select client_id from client_users where auth_user_id = auth.uid()
    )
  );

notify pgrst, 'reload schema';
