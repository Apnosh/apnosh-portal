-- ─────────────────────────────────────────────────────────────
-- 095_content_quotes.sql
--
-- Quotes for ad-hoc content requests that fall outside the client's
-- monthly plan (or any work the strategist wants to scope explicitly).
--
-- Flow:
--   1. Client submits a request via /dashboard/social/request -> writes
--      a client_tasks row.
--   2. Strategist picks it up. If it's covered by the monthly plan, no
--      quote — they just produce. If it's bigger (filming day, custom
--      reel, multi-graphic package) they create a content_quotes row
--      with line items and send it to the client.
--   3. Client sees the quote on the social hub + at
--      /dashboard/social/quotes/[id]. They approve, decline, or ask
--      for changes.
--   4. On approve, work proceeds; on decline, request is closed.
--
-- The clients.allotments JSONB column already tracks monthly plan
-- capacity per service area — that's the plan side. This table is
-- specifically for paid one-offs and over-plan work.
-- ─────────────────────────────────────────────────────────────

create table if not exists content_quotes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,

  -- Link back to the originating request. We don't FK this because the
  -- request can live in different tables (client_tasks today; possibly
  -- graphic_requests / video_requests later). Strategists fill the
  -- summary so the client always has context on what's being quoted.
  source_request_id uuid,
  source_request_summary text,

  -- Quote contents
  title text not null,
  line_items jsonb not null default '[]',
  subtotal numeric,
  discount numeric default 0,
  total numeric not null,
  estimated_turnaround_days integer,

  strategist_message text,
  client_message text,

  -- Lifecycle
  status text not null default 'draft' check (status in (
    'draft',      -- strategist building, not yet visible to client
    'sent',       -- waiting on client decision
    'approved',   -- client said yes; work proceeds
    'declined',   -- client said no; request closed
    'revising',   -- client asked for changes; strategist iterating
    'expired'     -- timed out without a response
  )),

  sent_at timestamptz,
  responded_at timestamptz,
  expires_at timestamptz,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Queue index for "pending quotes" lookup on the social hub.
create index if not exists content_quotes_client_status_idx
  on content_quotes(client_id, status, sent_at desc);

create index if not exists content_quotes_source_idx
  on content_quotes(source_request_id)
  where source_request_id is not null;

-- updated_at trigger
do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'content_quotes_set_updated_at'
  ) then
    create trigger content_quotes_set_updated_at
      before update on content_quotes
      for each row execute function set_updated_at();
  end if;
end $$;

alter table content_quotes enable row level security;

create policy "Admins manage content_quotes" on content_quotes
  for all using (is_admin());

-- Clients only see quotes that are out of draft, and only their own.
create policy "Clients read own non-draft content_quotes" on content_quotes
  for select using (
    client_id = current_client_id()
    and status <> 'draft'
  );

-- Clients can update sent / revising quotes (to set their response). The
-- API route enforces the actual state transitions on top of this.
create policy "Clients respond to own content_quotes" on content_quotes
  for update using (
    client_id = current_client_id()
    and status in ('sent', 'revising')
  );

comment on table content_quotes is
  'Strategist-built quotes for content work that falls outside the client''s monthly plan or anything they want to scope explicitly. One row per quote; lifecycle owns the back-and-forth.';

comment on column content_quotes.line_items is
  'JSONB array. Each item: {label: string, qty: number, unit_price: number, total: number, notes?: string}.';
