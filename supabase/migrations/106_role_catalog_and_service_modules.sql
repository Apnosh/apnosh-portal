-- ─────────────────────────────────────────────────────────────
-- 106_role_catalog_and_service_modules.sql
--
-- Locks in the 17-role / 4-service-line foundation:
--
-- 1. Extends role_capability enum with the missing roles (designer,
--    email_specialist, local_seo, web_ops, web_designer, web_developer,
--    data_analyst, onboarder, finance, paid_media, visual_creator).
--    Keeps existing values (videographer, photographer, ad_buyer,
--    influencer) for backwards-compat — shoots and ad_campaigns rows
--    already reference these. We'll migrate at the application layer.
--
-- 2. Adds clients.service_modules jsonb — which of the 4 service-line
--    modules a client subscribes to and at what tier. Shape:
--      { social: 'lite' | 'standard' | 'pro' | null,
--        website: 'lite' | 'standard' | 'pro' | null,
--        email: 'lite' | 'standard' | 'pro' | null,
--        local: 'lite' | 'standard' | 'pro' | null }
--
-- 3. service_module_catalog table — the pricing + allotment source of
--    truth. The strategist surface reads this to show what each tier
--    includes; the quote builder reads this to know what's in-plan
--    vs. over-plan.
--
-- 4. Backfills service_modules for existing clients based on current
--    tier (Basic / Standard / Pro maps to lite / standard / pro on the
--    Social module since that's most of what we ship today).
-- ─────────────────────────────────────────────────────────────

-- ── 1) Extend role_capability enum ────────────────────────────
do $$
begin
  if not exists (select 1 from pg_enum where enumlabel = 'designer'
                 and enumtypid = (select oid from pg_type where typname = 'role_capability'))
  then alter type role_capability add value 'designer'; end if;
end$$;
do $$
begin
  if not exists (select 1 from pg_enum where enumlabel = 'email_specialist'
                 and enumtypid = (select oid from pg_type where typname = 'role_capability'))
  then alter type role_capability add value 'email_specialist'; end if;
end$$;
do $$
begin
  if not exists (select 1 from pg_enum where enumlabel = 'local_seo'
                 and enumtypid = (select oid from pg_type where typname = 'role_capability'))
  then alter type role_capability add value 'local_seo'; end if;
end$$;
do $$
begin
  if not exists (select 1 from pg_enum where enumlabel = 'web_ops'
                 and enumtypid = (select oid from pg_type where typname = 'role_capability'))
  then alter type role_capability add value 'web_ops'; end if;
end$$;
do $$
begin
  if not exists (select 1 from pg_enum where enumlabel = 'web_designer'
                 and enumtypid = (select oid from pg_type where typname = 'role_capability'))
  then alter type role_capability add value 'web_designer'; end if;
end$$;
do $$
begin
  if not exists (select 1 from pg_enum where enumlabel = 'web_developer'
                 and enumtypid = (select oid from pg_type where typname = 'role_capability'))
  then alter type role_capability add value 'web_developer'; end if;
end$$;
do $$
begin
  if not exists (select 1 from pg_enum where enumlabel = 'data_analyst'
                 and enumtypid = (select oid from pg_type where typname = 'role_capability'))
  then alter type role_capability add value 'data_analyst'; end if;
end$$;
do $$
begin
  if not exists (select 1 from pg_enum where enumlabel = 'onboarder'
                 and enumtypid = (select oid from pg_type where typname = 'role_capability'))
  then alter type role_capability add value 'onboarder'; end if;
end$$;
do $$
begin
  if not exists (select 1 from pg_enum where enumlabel = 'finance'
                 and enumtypid = (select oid from pg_type where typname = 'role_capability'))
  then alter type role_capability add value 'finance'; end if;
end$$;
do $$
begin
  if not exists (select 1 from pg_enum where enumlabel = 'paid_media'
                 and enumtypid = (select oid from pg_type where typname = 'role_capability'))
  then alter type role_capability add value 'paid_media'; end if;
end$$;
do $$
begin
  if not exists (select 1 from pg_enum where enumlabel = 'visual_creator'
                 and enumtypid = (select oid from pg_type where typname = 'role_capability'))
  then alter type role_capability add value 'visual_creator'; end if;
end$$;

-- ── 2) clients.service_modules ────────────────────────────────
alter table clients
  add column if not exists service_modules jsonb not null
    default jsonb_build_object('social', null, 'website', null, 'email', null, 'local', null);

comment on column clients.service_modules is
  'Which service-line modules this client subscribes to. Keys: social | website | email | local. Values: ''lite'' | ''standard'' | ''pro'' | null. Null = not subscribed to that line. See service_module_catalog for what each tier includes.';

-- ── 3) service_module_catalog ─────────────────────────────────
create table if not exists service_module_catalog (
  id           uuid primary key default gen_random_uuid(),
  service      text not null check (service in ('social','website','email','local')),
  tier         text not null check (tier in ('lite','standard','pro')),
  name         text not null,
  price_cents  int  not null,
  description  text,
  allotments   jsonb not null default '{}'::jsonb,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (service, tier)
);

comment on table service_module_catalog is
  'Pricing + allotment source of truth for the 4 service-line modules. Strategist UI reads this to show what is included; quote builder reads this to know in-plan vs over-plan.';

-- RLS: everyone can read the catalog (it is public pricing). Only admin writes.
alter table service_module_catalog enable row level security;
drop policy if exists "everyone reads catalog" on service_module_catalog;
create policy "everyone reads catalog"
  on service_module_catalog for select using (true);
drop policy if exists "admin writes catalog" on service_module_catalog;
create policy "admin writes catalog"
  on service_module_catalog for all using (is_admin()) with check (is_admin());

-- ── 4) Seed the catalog with the strawman tiers ───────────────
-- Prices are placeholder; tune in /admin/settings later. Allotments
-- are the in-plan limits — anything over routes through content_quotes.
insert into service_module_catalog (service, tier, name, price_cents, description, allotments) values
  -- Social Media
  ('social','lite','Social Lite', 80000,
    'Maintaining presence. 8 posts a month, basic engagement during business hours.',
    jsonb_build_object('posts_per_month',8,'videos_per_month',1,'engagement','business_hours','reports','monthly')),
  ('social','standard','Social Standard', 180000,
    'Growing locally. 16 posts a month, 4 videos, premium engagement, custom themes.',
    jsonb_build_object('posts_per_month',16,'videos_per_month',4,'engagement','premium_hours','themes',true)),
  ('social','pro','Social Pro', 360000,
    'Multi-location or aggressive growth. 30+ posts a month, 8+ videos, 24/7 engagement, influencer slots.',
    jsonb_build_object('posts_per_month',30,'videos_per_month',8,'engagement','24_7','influencer_slots_per_quarter',2)),

  -- Website
  ('website','lite','Website Lite', 30000,
    'Light touch. Swap hours, photos, menu items. Small content edits.',
    jsonb_build_object('changes_per_month',5)),
  ('website','standard','Website Standard', 90000,
    'Quarterly refresh + conversion improvements + content marketing support.',
    jsonb_build_object('changes_per_month',15,'quarterly_refresh',true,'cro_support',true)),
  ('website','pro','Website Pro', 240000,
    'Custom dev, A/B testing, full ownership of the site as a growth channel.',
    jsonb_build_object('changes_per_month',null,'custom_dev',true,'ab_testing',true)),

  -- Email
  ('email','lite','Email Lite', 25000,
    'Stay in touch. 2 campaigns a month, basic list management.',
    jsonb_build_object('campaigns_per_month',2)),
  ('email','standard','Email Standard', 80000,
    '4 campaigns a month, welcome series, segmentation, drip basics.',
    jsonb_build_object('campaigns_per_month',4,'automation','welcome_drip')),
  ('email','pro','Email Pro', 200000,
    '8+ campaigns, full lifecycle automation, SMS (when available), transactional.',
    jsonb_build_object('campaigns_per_month',8,'automation','full_lifecycle','sms',true)),

  -- Local Presence & SEO
  ('local','lite','Local Lite', 35000,
    'GBP optimized, monthly review monitoring.',
    jsonb_build_object('locations',1,'review_monitoring','monthly','citations',false)),
  ('local','standard','Local Standard', 95000,
    'Single location. Review response, ranking reports, bi-weekly content updates, schema.',
    jsonb_build_object('locations',1,'review_monitoring','daily','review_response',true,'reports','monthly','schema',true)),
  ('local','pro','Local Pro', 240000,
    'Multi-location, geo-content, deep local SEO, hyper-local campaigns.',
    jsonb_build_object('locations',5,'review_monitoring','daily','review_response',true,'reports','weekly','geo_content',true))
on conflict (service, tier) do nothing;

-- ── 5) Backfill clients.service_modules from existing tier ────
-- Map: Basic -> social lite, Standard -> social standard, Pro -> social pro.
-- Internal/null -> no auto-subscribe (admin can set later).
-- Other service lines start null; admin sets per client when known.
update clients
set service_modules = jsonb_build_object(
  'social', case tier
              when 'Basic'    then 'lite'
              when 'Standard' then 'standard'
              when 'Pro'      then 'pro'
              else null
            end,
  'website', null,
  'email', null,
  'local', null
)
where service_modules = jsonb_build_object('social', null, 'website', null, 'email', null, 'local', null);

-- Sanity counts (visible in Studio output).
do $$
declare
  c_modules int;
  c_catalog int;
  c_enum int;
begin
  select count(*) into c_modules from clients where service_modules is not null;
  select count(*) into c_catalog from service_module_catalog;
  select count(*) into c_enum from pg_enum where enumtypid = (select oid from pg_type where typname = 'role_capability');
  raise notice 'clients with service_modules: %, catalog entries: %, role_capability enum values: %', c_modules, c_catalog, c_enum;
end$$;
