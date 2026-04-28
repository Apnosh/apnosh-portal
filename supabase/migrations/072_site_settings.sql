-- ============================================================
-- Migration 072: Per-client site settings for Apnosh Sites
-- ============================================================
-- The /sites/[slug] page renders restaurants' websites pulling data
-- from clients + gbp_locations + client_updates. But it also needs
-- presentation-layer fields (hero photo, tagline, brand colors,
-- order-online links) that don't fit on those tables.
--
-- This migration introduces site_settings as a 1:1 with clients,
-- so each restaurant has one row that controls how their site looks.
-- ============================================================

create table if not exists site_settings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique references clients(id) on delete cascade,

  -- Hero / branding
  tagline text,                                -- "Seattle's most-loved ramen since 2018"
  hero_photo_url text,                         -- main hero background
  logo_url text,                               -- optional brand logo (overrides client logo)

  -- Brand color theme (hex codes; defaults applied in renderer)
  primary_color text,                          -- main brand color (e.g. "#2D4A22")
  accent_color text,                           -- highlight / CTA color
  background_color text,                       -- page background (default white)
  text_color text,                             -- body text color (default near-black)

  -- Typography (web-safe / Google fonts identifiers)
  heading_font text,                           -- e.g. "Playfair Display"
  body_font text,                              -- e.g. "Inter"

  -- Ordering / reservations links
  order_online_url text,                       -- Toast / ChowNow / DoorDash / direct
  reservation_url text,                        -- OpenTable / Resy / Tock
  delivery_urls jsonb default '{}'::jsonb,     -- { doordash, ubereats, grubhub }

  -- Social links surfaced on the site
  instagram_url text,
  facebook_url text,
  tiktok_url text,

  -- Publication state
  is_published boolean not null default false, -- gates whether /sites/<slug> is live
  custom_domain text,                          -- future: <domain>.com → CNAMEs to apnosh
  custom_domain_verified_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_site_settings_client on site_settings(client_id);
create index if not exists idx_site_settings_published on site_settings(is_published) where is_published = true;
create index if not exists idx_site_settings_custom_domain on site_settings(custom_domain) where custom_domain is not null;

create or replace function site_settings_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_site_settings_updated_at on site_settings;
create trigger trg_site_settings_updated_at
  before update on site_settings
  for each row execute function site_settings_set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────
alter table site_settings enable row level security;

do $$ begin
  create policy "admins manage site_settings"
    on site_settings for all
    using (is_admin())
    with check (is_admin());
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "clients read their site_settings"
    on site_settings for select
    using (
      client_id in (
        select client_id from client_users where auth_user_id = auth.uid()
      )
    );
exception when duplicate_object then null;
end $$;

-- Public read for the published-site rendering
-- (the public /sites/[slug] route uses the service role key anyway,
-- but this allows future RPC patterns)
do $$ begin
  create policy "anyone reads published site_settings"
    on site_settings for select
    using (is_published = true);
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
