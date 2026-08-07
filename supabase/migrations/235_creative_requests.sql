-- ─────────────────────────────────────────────────────────────
-- 235: CREATIVE REQUESTS — the "ask us for anything" spine.
--
-- Generalizes the design order into one request table for every
-- kind of marketing work (graphics, menus, logos, websites,
-- video, photos, social, email, ads, print, writing). Request
-- first, quote later: a row here never charges anyone; the team
-- reads it, sets a status, and answers with a note. Statuses
-- match src/lib/requests/catalog.ts REQUEST_STATUSES.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.creative_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  -- request type id from the catalog: graphic | menu | logo | website | video
  -- | photos | social | email | ads | print | copy | other
  type text not null,
  -- the owner's answers, question id -> answer (validated server side)
  brief jsonb not null default '{}'::jsonb,
  status text not null default 'requested'
    check (status in ('requested', 'in_review', 'quoted', 'in_progress', 'delivered', 'closed', 'declined')),
  -- the team's reply the owner sees (the quote, the plan, or why declined)
  team_note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists creative_requests_client_idx
  on public.creative_requests (client_id, created_at desc);
create index if not exists creative_requests_status_idx
  on public.creative_requests (status, created_at desc);

alter table public.creative_requests enable row level security;

do $$ begin
  create policy creative_requests_admin
    on public.creative_requests for all
    using (is_admin()) with check (is_admin());
exception when duplicate_object then null; end $$;

-- Owners read their own requests. Writes go through the server API
-- (service role) so validation cannot be skipped, hence no client
-- insert/update policy on purpose.
do $$ begin
  create policy creative_requests_client_read
    on public.creative_requests for select
    using (
      client_id in (
        select client_id from public.client_users where auth_user_id = auth.uid()
        union
        select client_id from public.businesses where owner_id = auth.uid()
      )
    );
exception when duplicate_object then null; end $$;
