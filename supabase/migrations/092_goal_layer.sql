-- 092_goal_layer.sql
--
-- The goal layer (per docs/PRODUCT-SPEC.md and decision logs 0001-0005).
--
-- Five additions:
--   1. clients.shape -- 4 columns describing the restaurant
--      (footprint, concept, customer_mix, digital_maturity)
--   2. goals_catalog -- seeded with the 8 goals from the spec
--   3. client_goals -- 1-3 active goals per client, prioritized,
--      time-bound. Replaces ad-hoc strategist tracking.
--   4. goal_playbooks -- recommended service emphasis per (goal x
--      shape modifier). Hand-curated initially; refined by strategist
--      overrides over time (the playbook IP moat).
--   5. service_goal_tags -- many-to-many: services tagged with which
--      goals they serve.
--
-- Note: this migration is INFRASTRUCTURE ONLY. No owner-facing copy
-- yet; the onboarding UX with goal copy in owner-voice ships after
-- strategist + owner conversations land (per decision 0005).

-- ── 1. Restaurant shape on clients ────────────────────────────────

alter table clients
  add column if not exists shape_footprint text
    check (shape_footprint in (
      'single_neighborhood', 'single_destination',
      'multi_local', 'multi_regional', 'enterprise',
      'mobile', 'ghost'
    )),
  add column if not exists shape_concept text
    check (shape_concept in (
      'qsr', 'fast_casual', 'casual', 'fine_dining',
      'bar', 'cafe', 'mobile', 'delivery_only', 'catering_heavy'
    )),
  add column if not exists shape_customer_mix text
    check (shape_customer_mix in (
      'local_repeat', 'local_destination', 'tourist_heavy',
      'regional_draw', 'b2b_catering'
    )),
  add column if not exists shape_digital_maturity text
    check (shape_digital_maturity in (
      'nascent', 'basic', 'active', 'sophisticated'
    )),
  add column if not exists shape_captured_at timestamptz,
  add column if not exists shape_captured_by uuid references team_members(id) on delete set null;

create index if not exists idx_clients_shape
  on clients(shape_footprint, shape_concept);

comment on column clients.shape_footprint is
  'One of 7 footprint values. Set during onboarding; reviewed quarterly. '
  'Drives playbook adaptation per docs/PRODUCT-SPEC.md.';

-- ── 2. Goals catalog ─────────────────────────────────────────────

create table if not exists goals_catalog (
  slug text primary key,                       -- e.g. 'more_foot_traffic'
  display_name text not null,                  -- "More foot traffic"
  owner_voice text not null,                   -- short owner-language phrase
  rationale text not null,                     -- one-line explanation of how it drives sales
  primary_signal text,                         -- what we measure (e.g. 'first_time_walkins')
  primary_lever text,                          -- e.g. 'gbp_local_seo_local_ads'
  sort_order int not null default 100,
  is_active boolean not null default true,     -- soft-disable goals without dropping rows
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table goals_catalog enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public'
      and tablename='goals_catalog' and policyname='Anyone reads goals_catalog'
  ) then
    create policy "Anyone reads goals_catalog"
      on goals_catalog for select using (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public'
      and tablename='goals_catalog' and policyname='Admins manage goals_catalog'
  ) then
    create policy "Admins manage goals_catalog"
      on goals_catalog for all using (is_admin());
  end if;
end $$;

-- Seed the 8 goals. owner_voice is placeholder pending strategist +
-- owner conversation feedback (per decision 0005); rationale is firm.
insert into goals_catalog(slug, display_name, owner_voice, rationale, primary_signal, primary_lever, sort_order) values
  ('more_foot_traffic',
   'More foot traffic',
   'I want more first-time customers walking in',
   'Drives sales through volume; best when you have unused capacity at peak times.',
   'first_time_walkins', 'gbp_local_seo_local_ads', 10),
  ('regulars_more_often',
   'My regulars come back more often',
   'I want my regulars coming back more often',
   'Drives sales through frequency; usually the cheapest path to growth.',
   'visit_frequency', 'email_sms_loyalty_dayparting', 20),
  ('more_online_orders',
   'More online orders',
   'I want more online and delivery orders',
   'Drives sales through digital channels; doesn''t depend on foot traffic.',
   'online_orders_per_week', 'delivery_app_optimization_social_ctas', 30),
  ('more_reservations',
   'More reservations',
   'I want more booked reservations',
   'Drives sales through booked covers; reduces walk-in dependency.',
   'booked_covers_per_week', 'reservation_funnel_opentable_resy', 40),
  ('better_reputation',
   'Better online reputation',
   'I want better reviews and a stronger online reputation',
   'Drives sales through trust; foundation for everything else.',
   'avg_rating_review_velocity_response_rate', 'review_fetch_response_reputation_campaigns', 50),
  ('be_known_for',
   'Be known as the spot for ___',
   'I want to be known as the spot for [thing]',
   'Drives sales through branded demand and category leadership.',
   'branded_search_volume', 'content_engine_social_storytelling_influencers', 60),
  ('fill_slow_times',
   'Fill my slow times',
   'I want to fill my slow nights / lunches / off-peak',
   'Drives sales through better daypart utilization at no extra real-estate cost.',
   'daypart_specific_covers', 'targeted_promos_daypart_content', 70),
  ('grow_catering',
   'Grow catering / private events',
   'I want more catering and private event business',
   'Drives sales through B2B and event revenue; less weather-dependent.',
   'catering_inquiries_per_month', 'b2b_seo_linkedin_catering_landing_pages', 80)
on conflict (slug) do nothing;

-- ── 3. Client goals ──────────────────────────────────────────────

create table if not exists client_goals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  goal_slug text not null references goals_catalog(slug) on delete restrict,

  priority int not null check (priority between 1 and 3),
  target_date date,                        -- when they want to hit it; null = quarter end
  status text not null default 'active'
    check (status in ('active', 'achieved', 'abandoned', 'superseded')),

  notes text,                              -- strategist notes on this goal
  set_by uuid references team_members(id) on delete set null,

  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one active goal per client per priority slot.
create unique index if not exists client_goals_unique_priority_active
  on client_goals(client_id, priority)
  where status = 'active';

create index if not exists idx_client_goals_client
  on client_goals(client_id, status);
create index if not exists idx_client_goals_slug
  on client_goals(goal_slug, status);

alter table client_goals enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public'
      and tablename='client_goals' and policyname='Admins manage client_goals'
  ) then
    create policy "Admins manage client_goals"
      on client_goals for all using (is_admin());
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public'
      and tablename='client_goals' and policyname='Client reads own goals'
  ) then
    create policy "Client reads own goals"
      on client_goals for select using (client_id = current_client_id());
  end if;
end $$;

-- ── 4. Goal playbooks ────────────────────────────────────────────
-- For each (goal x shape modifier), describes which services to
-- emphasize. Null shape modifiers = applies to all shapes.

create table if not exists goal_playbooks (
  id uuid primary key default gen_random_uuid(),
  goal_slug text not null references goals_catalog(slug) on delete cascade,

  -- Shape modifiers. Null = matches any value for that dimension.
  -- Arrays so a single rule can apply to multiple values.
  footprint_match text[],
  concept_match text[],
  customer_mix_match text[],
  digital_maturity_match text[],

  service_slug text not null,              -- references service catalog by slug
  emphasis text not null
    check (emphasis in ('high', 'medium', 'low', 'avoid')),

  notes text,
  sort_order int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_goal_playbooks_goal
  on goal_playbooks(goal_slug);
create index if not exists idx_goal_playbooks_service
  on goal_playbooks(service_slug);

alter table goal_playbooks enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public'
      and tablename='goal_playbooks' and policyname='Anyone reads goal_playbooks'
  ) then
    create policy "Anyone reads goal_playbooks"
      on goal_playbooks for select using (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public'
      and tablename='goal_playbooks' and policyname='Admins manage goal_playbooks'
  ) then
    create policy "Admins manage goal_playbooks"
      on goal_playbooks for all using (is_admin());
  end if;
end $$;

-- Seed: starting playbook entries. These are first-pass strategist
-- intuition; refined by overrides over time (the moat that compounds).
insert into goal_playbooks(goal_slug, footprint_match, concept_match, service_slug, emphasis, notes) values
  -- More foot traffic: GBP + local SEO are universal
  ('more_foot_traffic', null, null, 'local-seo-management', 'high', 'GBP + local SEO are the foundation regardless of shape'),
  ('more_foot_traffic', null, null, 'reputation-management', 'high', 'Reviews drive discovery + click-through'),
  ('more_foot_traffic', array['single_neighborhood'], null, 'social-media-management', 'low', 'Single-neighborhood spots benefit less from social-at-scale'),
  ('more_foot_traffic', array['multi_local','multi_regional'], null, 'social-media-management', 'medium', 'Multi-loc benefits from cross-store consistency'),
  ('more_foot_traffic', array['ghost','delivery_only'], null, 'local-seo-management', 'avoid', 'Foot traffic goal does not apply -- recommend more_online_orders'),

  -- Regulars more often: email + SMS + content
  ('regulars_more_often', null, null, 'email-sms', 'high', 'Direct line to existing customers'),
  ('regulars_more_often', null, null, 'social-media-management', 'medium', 'Reminds regulars; daypart content'),
  ('regulars_more_often', null, null, 'local-seo-management', 'low', 'Less leverage for repeat visits'),

  -- More online orders: delivery-app focus
  ('more_online_orders', null, null, 'website-management', 'high', 'Online-order conversion lives on the site'),
  ('more_online_orders', null, null, 'social-media-management', 'medium', 'Social drives ordering CTAs'),
  ('more_online_orders', null, null, 'paid-social', 'medium', 'Performance ads to delivery menu'),

  -- More reservations: funnel + reservation platforms
  ('more_reservations', null, null, 'website-management', 'high', 'Reservation widget + landing page'),
  ('more_reservations', null, array['fine_dining','casual'], 'social-media-management', 'medium', 'Visual content drives reservation intent'),

  -- Better reputation: reviews + response
  ('better_reputation', null, null, 'reputation-management', 'high', 'Direct goal; review fetch + response'),
  ('better_reputation', null, null, 'local-seo-management', 'medium', 'GBP also affects perception'),

  -- Be known as the spot for ___: content engine + social
  ('be_known_for', null, null, 'content-creation', 'high', 'Storytelling is the lever'),
  ('be_known_for', null, null, 'social-media-management', 'high', 'Distribution channel'),
  ('be_known_for', null, null, 'paid-social', 'medium', 'Amplifies the best content'),

  -- Fill slow times: targeted promos + dayparting
  ('fill_slow_times', null, null, 'email-sms', 'high', 'Targeted promos to existing list'),
  ('fill_slow_times', null, null, 'paid-social', 'medium', 'Daypart-targeted ads'),

  -- Grow catering: B2B SEO + landing pages
  ('grow_catering', null, null, 'website-management', 'high', 'Catering inquiry funnel'),
  ('grow_catering', null, null, 'local-seo-management', 'medium', 'B2B local search')
on conflict do nothing;

-- ── 5. Service goal tags ─────────────────────────────────────────
-- Many-to-many: each service can serve multiple goals; each goal is
-- served by multiple services. Strength indicates how central a service
-- is to the goal (primary = core lever, secondary = supports,
-- incidental = adjacent benefit).

create table if not exists service_goal_tags (
  id uuid primary key default gen_random_uuid(),
  service_slug text not null,
  goal_slug text not null references goals_catalog(slug) on delete cascade,
  strength text not null
    check (strength in ('primary', 'secondary', 'incidental')),
  created_at timestamptz not null default now()
);

create unique index if not exists service_goal_tags_unique
  on service_goal_tags(service_slug, goal_slug);
create index if not exists idx_service_goal_tags_goal
  on service_goal_tags(goal_slug);

alter table service_goal_tags enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public'
      and tablename='service_goal_tags' and policyname='Anyone reads service_goal_tags'
  ) then
    create policy "Anyone reads service_goal_tags"
      on service_goal_tags for select using (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public'
      and tablename='service_goal_tags' and policyname='Admins manage service_goal_tags'
  ) then
    create policy "Admins manage service_goal_tags"
      on service_goal_tags for all using (is_admin());
  end if;
end $$;

-- Seed: service -> goals tagging. Mirrors the playbook emphasis above.
insert into service_goal_tags(service_slug, goal_slug, strength) values
  ('local-seo-management',     'more_foot_traffic',    'primary'),
  ('local-seo-management',     'better_reputation',    'secondary'),
  ('local-seo-management',     'grow_catering',        'secondary'),
  ('reputation-management',    'better_reputation',    'primary'),
  ('reputation-management',    'more_foot_traffic',    'secondary'),
  ('email-sms',                'regulars_more_often',  'primary'),
  ('email-sms',                'fill_slow_times',      'primary'),
  ('social-media-management',  'be_known_for',         'primary'),
  ('social-media-management',  'regulars_more_often',  'secondary'),
  ('social-media-management',  'more_foot_traffic',    'secondary'),
  ('content-creation',         'be_known_for',         'primary'),
  ('content-creation',         'better_reputation',    'secondary'),
  ('paid-social',              'more_online_orders',   'primary'),
  ('paid-social',              'fill_slow_times',      'secondary'),
  ('paid-social',              'be_known_for',         'secondary'),
  ('website-management',       'more_online_orders',   'primary'),
  ('website-management',       'more_reservations',    'primary'),
  ('website-management',       'grow_catering',        'primary')
on conflict do nothing;
