-- ============================================================
-- 004: Brand & Style Guidelines
-- Living brand guidelines with versioning, AI generation tracking,
-- and PDF upload support
-- ============================================================

create table if not exists brand_guidelines (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  version integer not null default 1,
  status text not null default 'draft' check (status in ('current', 'draft', 'archived')),
  source text not null default 'auto' check (source in ('auto', 'uploaded', 'manual', 'revised')),
  uploaded_file_url text,

  -- Section content (JSONB for flexibility)
  brand_overview jsonb default '{}'::jsonb,
  visual_identity jsonb default '{}'::jsonb,
  voice_and_tone jsonb default '{}'::jsonb,
  audience_profile jsonb default '{}'::jsonb,
  competitive_positioning jsonb default '{}'::jsonb,
  content_guidelines jsonb default '{}'::jsonb,
  seasonal_calendar jsonb default '{}'::jsonb,
  custom_sections jsonb default '[]'::jsonb,

  -- Track which sections were AI-generated vs manually edited
  ai_generated_sections jsonb default '[]'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Only one 'current' guidelines per business
create unique index if not exists idx_brand_guidelines_current
  on brand_guidelines (business_id) where status = 'current';

create index if not exists idx_brand_guidelines_business
  on brand_guidelines (business_id, status);

-- RLS
alter table brand_guidelines enable row level security;

create policy "Clients read own guidelines" on brand_guidelines
  for select using (business_id in (select id from businesses where owner_id = auth.uid()));

create policy "Clients update own guidelines" on brand_guidelines
  for update using (business_id in (select id from businesses where owner_id = auth.uid()));

create policy "Clients insert own guidelines" on brand_guidelines
  for insert with check (business_id in (select id from businesses where owner_id = auth.uid()));

create policy "Admins manage all guidelines" on brand_guidelines
  for all using (is_admin());
