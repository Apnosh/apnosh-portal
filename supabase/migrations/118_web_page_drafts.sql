-- ─────────────────────────────────────────────────────────────
-- 118_web_page_drafts.sql
--
-- Page-copy drafts produced by the web team's AI helper. Same
-- compounding contract as content_drafts — retrieval-aware, audited
-- via ai_generation_ids, brand_voice_version stamped.
--
-- The actual page ship (HTML/CMS publish) is downstream; this table
-- is the editorial draft layer for web copy.
-- ─────────────────────────────────────────────────────────────

create table if not exists web_page_drafts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,

  -- What kind of page this is
  page_kind text not null check (page_kind in (
    'home_hero', 'about', 'menu_intro', 'reservation_cta',
    'catering', 'contact', 'press', 'careers', 'other'
  )),
  page_label text,                  -- free-form display name

  -- The actual copy
  headline text,
  subhead text,
  body_md text not null,
  cta_text text,
  cta_url text,

  -- Status workflow
  status text not null default 'draft' check (status in (
    'draft', 'in_review', 'approved', 'shipped', 'archived'
  )),

  -- AI provenance
  ai_assisted boolean not null default false,
  ai_generation_ids uuid[] not null default '{}',
  brand_voice_version int,

  -- Audit
  created_by uuid references auth.users(id) on delete set null,
  shipped_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists web_page_drafts_client_status_idx
  on web_page_drafts(client_id, status, created_at desc);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'web_page_drafts_set_updated_at') then
    create trigger web_page_drafts_set_updated_at
      before update on web_page_drafts
      for each row execute function set_updated_at();
  end if;
end $$;

alter table web_page_drafts enable row level security;

create policy "Admins manage web_page_drafts" on web_page_drafts
  for all using (is_admin());

-- web_* roles share read/insert/update on assigned book
create policy "web_team reads assigned page drafts"
  on web_page_drafts for select
  using (
    (has_capability('web_ops') or has_capability('web_designer') or has_capability('web_developer'))
    and client_id in (select assigned_client_ids())
  );

create policy "web_team inserts assigned page drafts"
  on web_page_drafts for insert
  with check (
    (has_capability('web_ops') or has_capability('web_designer') or has_capability('web_developer'))
    and client_id in (select assigned_client_ids())
  );

create policy "web_team updates assigned page drafts"
  on web_page_drafts for update
  using (
    (has_capability('web_ops') or has_capability('web_designer') or has_capability('web_developer'))
    and client_id in (select assigned_client_ids())
  )
  with check (
    (has_capability('web_ops') or has_capability('web_designer') or has_capability('web_developer'))
    and client_id in (select assigned_client_ids())
  );

-- Strategist sees them read-only
create policy "strategist reads assigned page drafts"
  on web_page_drafts for select
  using (
    has_capability('strategist')
    and client_id in (select assigned_client_ids())
  );

-- Clients read their own
create policy "clients read own page drafts"
  on web_page_drafts for select
  using (client_id = current_client_id());

-- Also: web team reads website_health on their book (used to render
-- the health card on /work/web). The table is presence-based RLS
-- elsewhere; add an explicit policy.
drop policy if exists "web_team reads website_health" on website_health;
create policy "web_team reads website_health"
  on website_health for select
  using (
    (has_capability('web_ops') or has_capability('web_designer') or has_capability('web_developer'))
    and client_id in (select assigned_client_ids())
  );

comment on table web_page_drafts is
  'Editorial drafts for website pages (home hero, about, menu intro, etc.). AI-drafted in the client''s voice with full retrieval provenance. Status drives draft → approved → shipped.';
