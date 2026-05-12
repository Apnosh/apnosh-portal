-- ─────────────────────────────────────────────────────────────
-- 115_local_reviews.sql
--
-- Cached Google Business Profile reviews (and eventually Yelp /
-- TripAdvisor / Apple Maps) so the Local SEO surface can show a
-- unified review queue across the agency book.
--
-- A 1-star review unanswered for 48 hours costs the restaurant
-- more than any other digital touchpoint. The Local SEO manager's
-- job is to respond to every review, fast, on-voice. This table
-- lets us track who's been responded to and what was said.
--
-- Review responses are voice-training gold: each one is the brand
-- replying *publicly* to a real customer. getClientContext can
-- surface recent responses as voice examples for future drafts.
-- ─────────────────────────────────────────────────────────────

create table if not exists local_reviews (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,

  -- Source
  source text not null default 'gbp' check (source in ('gbp', 'yelp', 'tripadvisor', 'apple_maps')),
  external_id text not null,             -- platform review id
  external_url text,                     -- deep link to the review

  -- Reviewer
  reviewer_name text,
  reviewer_avatar_url text,
  reviewer_is_local_guide boolean not null default false,

  -- Content
  rating int not null check (rating between 1 and 5),
  text text,                              -- can be empty for star-only reviews
  language text,                          -- e.g. 'en', 'vi'
  created_at_platform timestamptz not null,

  -- Reply lifecycle
  status text not null default 'open' check (status in ('open', 'replied', 'dismissed')),
  reply_text text,
  reply_at timestamptz,
  replied_by uuid references auth.users(id) on delete set null,
  ai_assisted boolean not null default false,

  -- AI provenance
  ai_generation_ids uuid[] not null default '{}',

  -- Audit
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, source, external_id)
);

-- Hot path: unanswered reviews per client, oldest first (so we surface
-- the most-at-risk one).
create index if not exists local_reviews_open_idx
  on local_reviews(client_id, status, created_at_platform asc)
  where status = 'open';

-- For voice training (find recent replied reviews to use as examples):
create index if not exists local_reviews_replied_idx
  on local_reviews(client_id, status, reply_at desc nulls last)
  where status = 'replied';

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'local_reviews_set_updated_at'
  ) then
    create trigger local_reviews_set_updated_at
      before update on local_reviews
      for each row execute function set_updated_at();
  end if;
end $$;

alter table local_reviews enable row level security;

create policy "Admins manage local_reviews" on local_reviews
  for all using (is_admin());

-- Local SEO managers see + update reviews on their book.
create policy "local_seo reads assigned reviews"
  on local_reviews for select
  using (
    has_capability('local_seo')
    and client_id in (select assigned_client_ids())
  );

create policy "local_seo updates assigned reviews"
  on local_reviews for update
  using (
    has_capability('local_seo')
    and client_id in (select assigned_client_ids())
  )
  with check (
    has_capability('local_seo')
    and client_id in (select assigned_client_ids())
  );

-- Strategists read-only (helps them spot pattern complaints/praise).
create policy "strategist reads assigned reviews"
  on local_reviews for select
  using (
    has_capability('strategist')
    and client_id in (select assigned_client_ids())
  );

-- Clients see their own reviews on the client portal.
create policy "clients read own reviews"
  on local_reviews for select
  using (client_id = current_client_id());

comment on table local_reviews is
  'Cached reviews from local platforms (GBP today, more later). Local SEO manages responses from /work/reviews. Replies recorded here become public voice examples that feed back into getClientContext.';
