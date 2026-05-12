-- ─────────────────────────────────────────────────────────────
-- 113_social_interactions.sql
--
-- Cached comments / DMs / mentions across all clients we manage.
-- The Meta API is the source of truth, but caching here gives us:
--   1. A unified /work/engage queue across N clients without N live
--      API calls on every page load.
--   2. Audit + provenance on every reply (who wrote it, was AI used,
--      what context flowed into the suggestion).
--   3. Voice training data: every approved reply becomes a positive
--      example of how this client talks to customers.
--
-- The actual reply is still sent via the existing /api/social/inbox
-- (Meta API). This table just records it.
-- ─────────────────────────────────────────────────────────────

create table if not exists social_interactions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,

  -- Source identity
  platform text not null check (platform in ('instagram', 'facebook', 'tiktok')),
  external_id text not null,            -- platform comment_id / message_id
  kind text not null check (kind in ('comment', 'dm', 'mention')),

  -- Author
  author_name text,
  author_handle text,
  author_external_id text,

  -- Content
  text text not null,
  post_external_id text,                -- platform post id this is on (for comments/mentions)
  post_caption_snippet text,
  parent_interaction_id uuid references social_interactions(id) on delete set null,
  created_at_platform timestamptz not null,

  -- Reply lifecycle
  status text not null default 'open' check (status in ('open', 'replied', 'dismissed', 'spam')),
  reply_text text,
  reply_at timestamptz,
  replied_by uuid references auth.users(id) on delete set null,
  ai_assisted boolean not null default false,

  -- AI provenance
  ai_generation_ids uuid[] not null default '{}',

  -- Triage
  sentiment text check (sentiment in ('positive', 'negative', 'neutral', 'question')),
  requires_attention boolean not null default false,

  -- Audit
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, platform, external_id)
);

create index if not exists social_interactions_open_idx
  on social_interactions(client_id, status, created_at_platform desc)
  where status = 'open';

create index if not exists social_interactions_kind_idx
  on social_interactions(client_id, kind, created_at_platform desc);

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'social_interactions_set_updated_at'
  ) then
    create trigger social_interactions_set_updated_at
      before update on social_interactions
      for each row execute function set_updated_at();
  end if;
end $$;

alter table social_interactions enable row level security;

create policy "Admins manage social_interactions" on social_interactions
  for all using (is_admin());

-- Community managers read + update on assigned book.
create policy "community_mgr reads assigned interactions"
  on social_interactions for select
  using (
    has_capability('community_mgr')
    and client_id in (select assigned_client_ids())
  );

create policy "community_mgr updates assigned interactions"
  on social_interactions for update
  using (
    has_capability('community_mgr')
    and client_id in (select assigned_client_ids())
  )
  with check (
    has_capability('community_mgr')
    and client_id in (select assigned_client_ids())
  );

-- Strategists get read-only visibility (helps them see what people are
-- saying when planning themes).
create policy "strategist reads assigned interactions"
  on social_interactions for select
  using (
    has_capability('strategist')
    and client_id in (select assigned_client_ids())
  );

comment on table social_interactions is
  'Cached engagement events (comments/DMs/mentions) from social platforms. /work/engage reads this for the unified community queue. Replies recorded here are also voice-training examples — the AI uses them via getClientContext to learn each client''s reply style.';
