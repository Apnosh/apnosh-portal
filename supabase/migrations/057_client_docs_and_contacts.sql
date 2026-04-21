-- ============================================================
-- Migration 057: client_docs table + contact enrichment
-- ============================================================
-- Rounds out the Apnosh client data model so we can fully retire
-- Notion. Two additions:
--
-- 1. client_docs -- freeform markdown/rich-text pages tied to a client.
--    Covers the big category of Notion content Apnosh currently has no
--    home for: strategy docs, competitor analysis, content pillars,
--    content ideas banks, monthly content plans, per-client SOPs, etc.
--
-- 2. client_contacts: add birthday / pronouns / title columns so the
--    contact records we import from Notion don't lose data.
--
-- client_profiles is ALREADY richer than Notion for structured profile
-- data (pain points, goals, cuisine, service styles, brand colors, etc.)
-- so no changes needed there.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. client_docs -- markdown/wiki pages per client
-- ──────────────────────────────────────────────────────────────

create table client_docs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,

  -- Display + organization
  title text not null,
  slug text,                  -- URL-safe version of the title, auto-generated
  category text check (category in (
    'strategy', 'competitor_analysis', 'content_planning', 'content_ideas',
    'content_pillars', 'meeting_notes', 'onboarding', 'playbook', 'summary',
    'other'
  ) or category is null),

  -- Nesting: allow docs to be organized as a tree (e.g. Content Planning
  -- has monthly plan subpages in Notion). Null = top-level.
  parent_doc_id uuid references client_docs(id) on delete cascade,
  sort_order int default 0,

  -- Content
  body_markdown text,         -- the actual content, stored as markdown

  -- Source tracking -- valuable for debugging import + future audit
  source text check (source in ('manual', 'notion_import', 'template') or source is null),
  source_id text,             -- original Notion page ID or similar
  source_metadata jsonb not null default '{}',

  -- Ownership
  created_by uuid references profiles(id) on delete set null,
  created_by_name text,       -- denormalized snapshot

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_client_docs_client on client_docs(client_id);
create index idx_client_docs_parent on client_docs(parent_doc_id);
create index idx_client_docs_category on client_docs(category);

create trigger client_docs_updated_at
  before update on client_docs
  for each row execute function set_updated_at();

-- Full-text search on title + body so the admin can quickly find a doc
-- across all clients.
create index idx_client_docs_search on client_docs
  using gin(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body_markdown, '')));


-- ──────────────────────────────────────────────────────────────
-- 2. client_contacts -- add Notion-style fields
-- ──────────────────────────────────────────────────────────────

alter table client_contacts
  add column if not exists birthday date,
  add column if not exists pronouns text,
  add column if not exists title text,        -- e.g. 'Owner', 'Manager', 'COO'
  add column if not exists source text check (source in ('manual', 'notion_import') or source is null),
  add column if not exists source_id text;    -- Notion page ID for audit / re-sync


-- ──────────────────────────────────────────────────────────────
-- 3. RLS on client_docs
-- ──────────────────────────────────────────────────────────────

alter table client_docs enable row level security;

-- Admin full access
create policy "admin full access on client_docs"
  on client_docs for all
  to authenticated
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- Client can read their own docs (later phase may allow write)
create policy "client reads own docs"
  on client_docs for select
  to authenticated
  using (
    client_id in (
      select client_id from client_users
      where auth_user_id = auth.uid()
    )
  );


-- ──────────────────────────────────────────────────────────────
-- Done.
-- ──────────────────────────────────────────────────────────────
