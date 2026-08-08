-- ─────────────────────────────────────────────────────────────
-- 236: CREATIVE REQUESTS v2 — close the loop.
--
-- The v1 rail (235) collects demand but cannot transact it: no
-- way to say yes to a quote, no files, one overwritable note,
-- no due date the queue can sort by. This adds:
--   * due_date        — the owner's real picked date (sortable)
--   * attachments     — [{url, name, path?}] files the owner hands us
--   * quote_cents     — the team's structured price (the note stays prose)
--   * assigned_to/_name — which admin claimed it
--   * accepted_at     — the owner's yes (status flips to in_progress)
--   * work_order_id   — bridge into creator_work_orders on accept,
--                       so delivery-gate + approval + billing apply
--   * creative_request_notes — the running thread (quotes are never
--                       destroyed by a later note again)
-- ─────────────────────────────────────────────────────────────

alter table public.creative_requests
  add column if not exists due_date date,
  add column if not exists attachments jsonb not null default '[]'::jsonb,
  add column if not exists quote_cents integer,
  add column if not exists assigned_to uuid,
  add column if not exists assigned_name text,
  add column if not exists accepted_at timestamptz,
  add column if not exists work_order_id uuid;

create index if not exists creative_requests_due_idx
  on public.creative_requests (due_date asc nulls last, created_at desc);

-- The thread: every team note and owner reply, append-only.
create table if not exists public.creative_request_notes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.creative_requests(id) on delete cascade,
  author_role text not null check (author_role in ('team', 'owner')),
  author_id uuid,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists creative_request_notes_req_idx
  on public.creative_request_notes (request_id, created_at asc);

alter table public.creative_request_notes enable row level security;

do $$ begin
  create policy creative_request_notes_admin
    on public.creative_request_notes for all
    using (is_admin()) with check (is_admin());
exception when duplicate_object then null; end $$;

-- Owners read the thread on their own requests. Writes go through the
-- server API (service role) so validation cannot be skipped — same
-- posture as creative_requests itself.
do $$ begin
  create policy creative_request_notes_client_read
    on public.creative_request_notes for select
    using (
      request_id in (
        select id from public.creative_requests where client_id in (
          select client_id from public.client_users where auth_user_id = auth.uid()
          union
          select client_id from public.businesses where owner_id = auth.uid()
        )
      )
    );
exception when duplicate_object then null; end $$;
