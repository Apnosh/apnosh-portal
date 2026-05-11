-- ─────────────────────────────────────────────────────────────
-- 097_pricing_rubric.sql
--
-- Default prices per content type. Used by the quote builder as
-- preset starting points. Admin-editable so Apnosh can adjust
-- pricing globally without a code release.
--
-- One row per content type. Strategists override on individual
-- quotes — this just establishes the default.
-- ─────────────────────────────────────────────────────────────

create table if not exists pricing_rubric (
  id uuid primary key default gen_random_uuid(),
  content_type text not null unique,    -- 'feed_post', 'reel', 'shoot_day', etc.
  label text not null,                   -- "Reel (30s)"
  unit_price numeric not null,           -- default price per unit
  unit_label text not null default 'each', -- "each", "day", "hour", etc.
  category text not null default 'content' check (category in (
    'content', 'production', 'campaign', 'addon'
  )),
  blurb text,                            -- short description
  active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pricing_rubric_active_idx
  on pricing_rubric(active, display_order)
  where active = true;

-- updated_at trigger
do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'pricing_rubric_set_updated_at'
  ) then
    create trigger pricing_rubric_set_updated_at
      before update on pricing_rubric
      for each row execute function set_updated_at();
  end if;
end $$;

alter table pricing_rubric enable row level security;

create policy "Admins manage pricing_rubric" on pricing_rubric
  for all using (is_admin());

-- Anyone authenticated can read the active rubric (so the quote
-- builder works without admin role). Prices are not secret.
create policy "Authenticated read active pricing_rubric" on pricing_rubric
  for select using (auth.uid() is not null and active = true);

-- Seed with the same 7 presets the quote builder previously hardcoded.
insert into pricing_rubric (content_type, label, unit_price, category, blurb, display_order) values
  ('feed_post',  'Feed post (graphic + caption)', 75,  'content',    'Single feed post with custom graphic and caption', 10),
  ('carousel',   'Carousel post (3-5 slides)',    150, 'content',    'Multi-slide carousel with cover + body slides',    20),
  ('reel_short', 'Short-form reel (30s)',         150, 'content',    '30-second vertical video, edit + caption',         30),
  ('shoot_day',  'On-site filming day',           250, 'production', 'Up to 4 hours on-site, kitchen + dining b-roll',   40),
  ('graphic',    'Custom graphic',                100, 'content',    'One-off promo / quote / menu card graphic',        50),
  ('story_set',  'Story set (3-5 stories)',       80,  'content',    'Day-in-the-life story series',                     60),
  ('email',      'Email campaign',                200, 'campaign',   'Designed email with subject testing',              70)
on conflict (content_type) do nothing;

comment on table pricing_rubric is
  'Default unit prices per content type. Strategists pull from this in the quote builder; individual quote line items can override.';
