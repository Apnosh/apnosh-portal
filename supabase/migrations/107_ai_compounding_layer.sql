-- ─────────────────────────────────────────────────────────────
-- 107_ai_compounding_layer.sql
--
-- Implements the data layer described in docs/AI-FIRST-PRINCIPLES.md.
-- This is the foundation that makes Apnosh's data compound: every
-- artifact has provenance, every artifact has outcomes, every human
-- judgment captures a reason, every AI generation can retrieve
-- relevant context.
--
-- New objects (in order):
--   1. social_posts provenance columns
--   2. editorial_themes + client_brands version columns
--   3. content_drafts             — idea → publish ledger
--   4. content_revisions          — diff history per draft
--   5. client_knowledge_facts     — structured KB beyond free-text notes
--   6. human_judgments            — approve / revise / reject with reason
--   7. ai_generation_inputs       — context fed to each AI run (RAG audit)
--
-- RLS on every new table: clients see their own data; strategists
-- see their assigned book; admins see everything.
-- ─────────────────────────────────────────────────────────────

-- ── 1) social_posts provenance ────────────────────────────────
alter table social_posts
  add column if not exists source_theme_id   uuid references editorial_themes(id),
  add column if not exists source_draft_id   uuid,  -- FK added after content_drafts is created
  add column if not exists proposed_by       uuid references auth.users(id),
  add column if not exists proposed_via      text check (proposed_via in
    ('strategist','copywriter','designer','ai','client_request','imported')),
  add column if not exists approved_by       uuid references auth.users(id),
  add column if not exists ai_generation_ids uuid[] not null default '{}',
  add column if not exists brand_voice_version int,
  add column if not exists outcome_summary   jsonb;

comment on column social_posts.source_theme_id is
  'Editorial theme this post was generated under (provenance).';
comment on column social_posts.source_draft_id is
  'The content_drafts row this post graduated from. Set when status transitions to published.';
comment on column social_posts.proposed_via is
  'Who/what produced the original idea: strategist, copywriter, designer, ai, client_request, or imported (synced from Instagram without provenance).';
comment on column social_posts.outcome_summary is
  'Aggregated outcome for this piece — e.g. {vs_average: +20%, top_quartile: true, contributed_to_goal: ''foot_traffic''}. Populated by a nightly job.';

-- ── 2) Versioning on conditioning documents ───────────────────
alter table editorial_themes
  add column if not exists version int not null default 1;

alter table client_brands
  add column if not exists version int not null default 1;

-- ── 3) content_drafts ─────────────────────────────────────────
-- The missing workflow ledger. Idea → draft → approve → produce →
-- schedule → publish. Every transition is a data point.
create table if not exists content_drafts (
  id                   uuid primary key default gen_random_uuid(),
  client_id            uuid not null references clients(id) on delete cascade,
  source_theme_id      uuid references editorial_themes(id),

  status               text not null default 'idea' check (status in
    ('idea','draft','revising','approved','rejected','produced','scheduled','published')),
  service_line         text not null default 'social' check (service_line in
    ('social','website','email','local')),

  idea                 text not null,           -- the seed idea (short)
  caption              text,                     -- current or final caption
  media_brief          jsonb not null default '{}'::jsonb,  -- visual direction
  hashtags             text[] default '{}',
  target_platforms     text[] default '{}',      -- ['instagram','tiktok','facebook']
  target_publish_date  date,

  proposed_by          uuid references auth.users(id),
  proposed_via         text not null check (proposed_via in
    ('strategist','copywriter','designer','ai','client_request')),

  approved_by          uuid references auth.users(id),
  approved_at          timestamptz,
  rejection_reason     text,
  revision_count       int not null default 0,

  brand_voice_version  int,    -- version of client_brands at generation time
  theme_version        int,    -- version of editorial_themes at generation time
  ai_generation_ids    uuid[] not null default '{}',

  published_post_id    uuid references social_posts(id),
  scheduled_for        timestamptz,
  published_at         timestamptz,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists content_drafts_client_status
  on content_drafts (client_id, status, target_publish_date);
create index if not exists content_drafts_status
  on content_drafts (status) where status in ('idea','draft','revising');
create index if not exists content_drafts_published_post
  on content_drafts (published_post_id) where published_post_id is not null;

-- Now wire the FK from social_posts.source_draft_id back to content_drafts
alter table social_posts
  add constraint social_posts_source_draft_fk
  foreign key (source_draft_id) references content_drafts(id) on delete set null;

comment on table content_drafts is
  'Idea → publish ledger. Every social/web/email/local piece flows through this table. Status transitions are the training signal for AI; outcomes attach via published_post_id.';

-- ── 4) content_revisions — diff history per draft ─────────────
-- Every save of a draft writes a row. Diff between AI output and
-- human-final is captured here.
create table if not exists content_revisions (
  id           uuid primary key default gen_random_uuid(),
  draft_id     uuid not null references content_drafts(id) on delete cascade,
  revised_by   uuid references auth.users(id),
  revised_via  text not null check (revised_via in ('human','ai','system')),
  prior_caption text,
  new_caption  text,
  prior_brief  jsonb,
  new_brief    jsonb,
  note         text,
  created_at   timestamptz not null default now()
);

create index if not exists content_revisions_draft on content_revisions (draft_id, created_at);

comment on table content_revisions is
  'Every save of a content_draft. Diff between prior and new captures human edits to AI output — pure gold for fine-tuning later.';

-- ── 5) client_knowledge_facts — structured KB ─────────────────
-- Replaces free-text notes blob with a queryable, AI-retrievable
-- structured layer. Categories let RAG pull the right slice on demand.
create table if not exists client_knowledge_facts (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references clients(id) on delete cascade,
  category        text not null check (category in (
    'history','specialty','customer','voice','pet_peeve',
    'seasonality','competitor','event','signature_item',
    'value_prop','positioning','owner_quote','observation')),
  fact            text not null,
  source          text not null check (source in (
    'strategist_note','client_conversation','onboarding','observation',
    'ai_extracted','public_data','review_mining')),
  confidence      text not null default 'medium' check (confidence in
    ('low','medium','high','verified')),
  recorded_by     uuid references auth.users(id),
  recorded_at     timestamptz not null default now(),
  superseded_by   uuid references client_knowledge_facts(id),
  active          boolean not null default true,
  embedding_pending boolean not null default true    -- async embedding flag
);

create index if not exists facts_active_by_client
  on client_knowledge_facts (client_id) where active = true;
create index if not exists facts_by_category
  on client_knowledge_facts (client_id, category) where active = true;

comment on table client_knowledge_facts is
  'Structured client knowledge base. Replaces ad-hoc note fields. AI helpers query this to ground generation in client truth. Categories drive RAG retrieval.';

-- ── 6) human_judgments — capture the reason ───────────────────
create table if not exists human_judgments (
  id            uuid primary key default gen_random_uuid(),
  subject_type  text not null check (subject_type in (
    'content_draft','content_quote','editorial_theme',
    'ai_generation','review_response','dm_reply')),
  subject_id    uuid not null,
  judge_id      uuid not null references auth.users(id),
  judgment      text not null check (judgment in
    ('approved','revise','rejected','escalate','flag_train')),
  reason_tags   text[] not null default '{}',
  reason_note   text,
  context_snapshot jsonb,   -- what the judge was looking at when they decided
  created_at    timestamptz not null default now()
);

create index if not exists judgments_by_subject on human_judgments (subject_type, subject_id);
create index if not exists judgments_by_judge on human_judgments (judge_id, created_at desc);

comment on table human_judgments is
  'Every approve / revise / reject of an AI-generated or human-proposed artifact. reason_tags are the irreplaceable training signal — flag_train marks judgments explicitly suitable for future fine-tuning.';

-- ── 7) ai_generation_inputs — what context the AI saw ─────────
-- Pairs with ai_generations (already exists). Captures the RAG
-- context: which facts, posts, themes, brand version were retrieved
-- and passed in. Lets us answer "why did the AI suggest X?" and
-- "did our retrieval improve outputs?"
create table if not exists ai_generation_inputs (
  id               uuid primary key default gen_random_uuid(),
  generation_id    uuid not null,     -- FK to ai_generations.id (may not exist as FK if ai_generations is in different schema)
  client_id        uuid references clients(id),
  prompt           text not null,
  retrieved_facts  uuid[] not null default '{}',   -- client_knowledge_facts
  retrieved_posts  uuid[] not null default '{}',   -- social_posts
  retrieved_drafts uuid[] not null default '{}',   -- content_drafts
  brand_voice_version int,
  theme_version    int,
  cross_client_signal jsonb,    -- anonymized similar-restaurant patterns included
  model            text,
  created_at       timestamptz not null default now()
);

create index if not exists ai_inputs_by_gen on ai_generation_inputs (generation_id);
create index if not exists ai_inputs_by_client on ai_generation_inputs (client_id, created_at desc);

comment on table ai_generation_inputs is
  'RAG audit trail — what context was given to each AI call. Pairs with ai_generations. Enables "why did AI suggest this" and "does retrieval improve outputs" analysis.';

-- ──────────────────────────────────────────────────────────────
-- RLS: every new table gets the standard 4-policy stack:
--   1. admin all
--   2. strategist (assigned book) read
--   3. strategist (assigned book) write where relevant
--   4. client read (their own)
-- ──────────────────────────────────────────────────────────────

alter table content_drafts          enable row level security;
alter table content_revisions       enable row level security;
alter table client_knowledge_facts  enable row level security;
alter table human_judgments         enable row level security;
alter table ai_generation_inputs    enable row level security;

-- content_drafts
drop policy if exists "admin all drafts" on content_drafts;
create policy "admin all drafts" on content_drafts for all
  using (is_admin()) with check (is_admin());
drop policy if exists "strategist reads drafts" on content_drafts;
create policy "strategist reads drafts" on content_drafts for select
  using (has_capability('strategist') and client_id in (select assigned_client_ids()));
drop policy if exists "strategist writes drafts" on content_drafts;
create policy "strategist writes drafts" on content_drafts for all
  using (has_capability('strategist') and client_id in (select assigned_client_ids()))
  with check (has_capability('strategist') and client_id in (select assigned_client_ids()));
drop policy if exists "client reads own drafts" on content_drafts;
create policy "client reads own drafts" on content_drafts for select
  using (
    client_id in (
      select client_id from client_users where auth_user_id = auth.uid()
    )
  );

-- content_revisions (same scope as parent draft)
drop policy if exists "admin all revisions" on content_revisions;
create policy "admin all revisions" on content_revisions for all
  using (is_admin()) with check (is_admin());
drop policy if exists "strategist reads revisions" on content_revisions;
create policy "strategist reads revisions" on content_revisions for select
  using (has_capability('strategist') and draft_id in (
    select id from content_drafts where client_id in (select assigned_client_ids())
  ));
drop policy if exists "strategist writes revisions" on content_revisions;
create policy "strategist writes revisions" on content_revisions for insert
  with check (has_capability('strategist') and draft_id in (
    select id from content_drafts where client_id in (select assigned_client_ids())
  ));

-- client_knowledge_facts
drop policy if exists "admin all facts" on client_knowledge_facts;
create policy "admin all facts" on client_knowledge_facts for all
  using (is_admin()) with check (is_admin());
drop policy if exists "strategist reads facts" on client_knowledge_facts;
create policy "strategist reads facts" on client_knowledge_facts for select
  using (has_capability('strategist') and client_id in (select assigned_client_ids()));
drop policy if exists "strategist writes facts" on client_knowledge_facts;
create policy "strategist writes facts" on client_knowledge_facts for all
  using (has_capability('strategist') and client_id in (select assigned_client_ids()))
  with check (has_capability('strategist') and client_id in (select assigned_client_ids()));
drop policy if exists "client reads own facts" on client_knowledge_facts;
create policy "client reads own facts" on client_knowledge_facts for select
  using (
    client_id in (
      select client_id from client_users where auth_user_id = auth.uid()
    )
  );

-- human_judgments
drop policy if exists "admin all judgments" on human_judgments;
create policy "admin all judgments" on human_judgments for all
  using (is_admin()) with check (is_admin());
drop policy if exists "own judgments" on human_judgments;
create policy "own judgments" on human_judgments for select
  using (judge_id = auth.uid());
drop policy if exists "write own judgments" on human_judgments;
create policy "write own judgments" on human_judgments for insert
  with check (judge_id = auth.uid());

-- ai_generation_inputs (mostly admin + service-role; expose to strategist read for their book)
drop policy if exists "admin all ai inputs" on ai_generation_inputs;
create policy "admin all ai inputs" on ai_generation_inputs for all
  using (is_admin()) with check (is_admin());
drop policy if exists "strategist reads ai inputs" on ai_generation_inputs;
create policy "strategist reads ai inputs" on ai_generation_inputs for select
  using (has_capability('strategist') and client_id in (select assigned_client_ids()));

-- Sanity counts
do $$
declare
  drafts int; facts int; judgments int; revs int; inputs int;
begin
  select count(*) into drafts from content_drafts;
  select count(*) into facts from client_knowledge_facts;
  select count(*) into judgments from human_judgments;
  select count(*) into revs from content_revisions;
  select count(*) into inputs from ai_generation_inputs;
  raise notice 'AI layer ready -- drafts: %, facts: %, judgments: %, revisions: %, ai_inputs: %', drafts, facts, judgments, revs, inputs;
end$$;
