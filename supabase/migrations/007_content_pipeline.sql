-- Content Production Pipeline
-- 8-phase engine: Intelligence → Strategy → Ideation → Briefing → Creation → QA → Approval → Analysis

-- Client Intelligence Briefs (weekly per client)
create table if not exists client_intelligence (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  week_start date not null,
  trending_content jsonb default '[]',      -- [{topic, platform, relevance}]
  competitor_activity jsonb default '[]',    -- [{competitor, action, notes}]
  performance_insights jsonb default '[]',   -- [{metric, observation, suggestion}]
  audience_signals jsonb default '[]',       -- [{signal, source, implication}]
  generated_at timestamptz default now(),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz default now(),
  unique(business_id, week_start)
);

-- Content Pillars (4-6 per client)
create table if not exists content_pillars (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  description text,
  example_topics jsonb default '[]',
  sort_order integer default 0,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Content Concepts (ideation pool)
create table if not exists content_concepts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  pillar_id uuid references content_pillars(id) on delete set null,
  title text not null,
  description text,
  content_type text not null check (content_type in (
    'reel_storytelling', 'reel_showcase', 'reel_promo', 'reel_general_ad',
    'carousel_premium', 'carousel_standard', 'carousel_basic',
    'static_post', 'story', 'blog', 'email', 'gbp_post'
  )),
  platform text,
  status text not null default 'idea' check (status in ('idea', 'selected', 'briefed', 'archived')),
  source text default 'manual' check (source in ('ai', 'manual', 'client')),
  score integer,  -- priority/quality score
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Content Briefs (structured brief per content piece)
create table if not exists content_briefs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  concept_id uuid references content_concepts(id) on delete set null,
  deliverable_id uuid references deliverables(id) on delete set null,
  content_type text not null,
  title text not null,
  -- Brief sections
  objective text,
  target_audience text,
  key_message text,
  hook text,
  call_to_action text,
  visual_direction text,
  copy_direction text,
  hashtags jsonb default '[]',
  references jsonb default '[]',       -- [{url, description}]
  technical_specs jsonb default '{}',   -- {dimensions, duration, format}
  -- Workflow
  status text not null default 'draft' check (status in ('draft', 'approved', 'in_production', 'completed')),
  assigned_to uuid references auth.users(id),
  due_date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Shoot Plans (auto-generated from content calendar)
create table if not exists shoot_plans (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  shoot_date date not null,
  location text,
  duration_minutes integer default 60,
  -- Shot list
  shots jsonb default '[]',  -- [{brief_id, description, type, setup_notes}]
  equipment_notes text,
  talent_notes text,
  status text not null default 'planned' check (status in ('planned', 'confirmed', 'completed', 'cancelled')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Content Performance (post-publish tracking)
create table if not exists content_performance (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  deliverable_id uuid references deliverables(id) on delete cascade,
  calendar_entry_id uuid references content_calendar(id) on delete cascade,
  platform text not null,
  -- Metrics
  impressions integer default 0,
  reach integer default 0,
  engagement integer default 0,
  saves integer default 0,
  shares integer default 0,
  comments integer default 0,
  clicks integer default 0,
  engagement_rate numeric(5,2),
  -- Analysis
  performance_tier text check (performance_tier in ('top', 'average', 'below')),
  insights text,
  recorded_at timestamptz default now(),
  created_at timestamptz default now()
);

-- QA Checklists
create table if not exists qa_checklists (
  id uuid primary key default gen_random_uuid(),
  deliverable_id uuid not null references deliverables(id) on delete cascade,
  -- Checks
  brand_voice_pass boolean,
  brand_voice_notes text,
  technical_specs_pass boolean,
  technical_specs_notes text,
  strategic_alignment_pass boolean,
  strategic_alignment_notes text,
  copy_accuracy_pass boolean,
  copy_accuracy_notes text,
  visual_quality_pass boolean,
  visual_quality_notes text,
  -- Overall
  overall_pass boolean,
  reviewer_id uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz default now()
);

-- RLS policies
alter table client_intelligence enable row level security;
alter table content_pillars enable row level security;
alter table content_concepts enable row level security;
alter table content_briefs enable row level security;
alter table shoot_plans enable row level security;
alter table content_performance enable row level security;
alter table qa_checklists enable row level security;

-- Admin full access
create policy "Admins: client_intelligence" on client_intelligence for all using (is_admin());
create policy "Admins: content_pillars" on content_pillars for all using (is_admin());
create policy "Admins: content_concepts" on content_concepts for all using (is_admin());
create policy "Admins: content_briefs" on content_briefs for all using (is_admin());
create policy "Admins: shoot_plans" on shoot_plans for all using (is_admin());
create policy "Admins: content_performance" on content_performance for all using (is_admin());
create policy "Admins: qa_checklists" on qa_checklists for all using (is_admin());

-- Client read access to their own data
create policy "Clients: content_pillars" on content_pillars for select
  using (business_id in (select id from businesses where owner_id = auth.uid()));
create policy "Clients: content_performance" on content_performance for select
  using (business_id in (select id from businesses where owner_id = auth.uid()));
