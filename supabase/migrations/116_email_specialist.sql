-- ─────────────────────────────────────────────────────────────
-- 116_email_specialist.sql
--
-- Email campaign spine for the email_specialist surface.
-- (Migration 014 declared this table but the schema didn't make it
-- to the live DB. This is the canonical version.)
--
-- Email campaigns are the most "long form" content the system
-- produces. Same retrieval contract as everything else — brand
-- voice + recent posts + judgments + cross-client signal.
-- ─────────────────────────────────────────────────────────────

create table if not exists email_campaigns (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,

  -- Identity
  name text not null,
  subject text not null,
  preview_text text,

  -- Content
  body_text text,            -- plain text — what the AI drafts
  body_html text,            -- optional rendered HTML
  preview_url text,
  preview_image_url text,

  -- Seed for AI / human authoring
  brief jsonb not null default '{}'::jsonb,

  -- Status workflow
  status text not null default 'draft' check (status in (
    'draft', 'in_review', 'approved', 'scheduled', 'sending', 'sent', 'cancelled'
  )),

  -- Scheduling
  scheduled_for timestamptz,
  sent_at timestamptz,

  -- Audience
  recipient_count integer not null default 0,
  segment_name text,

  -- Metrics (populated after send)
  opens integer not null default 0,
  clicks integer not null default 0,
  unsubscribes integer not null default 0,
  bounces integer not null default 0,
  revenue numeric(10, 2),

  -- AI provenance
  ai_generation_ids uuid[] not null default '{}',
  ai_assisted boolean not null default false,

  -- Audit
  created_by uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_campaigns_client_status_idx
  on email_campaigns(client_id, status, created_at desc);

create index if not exists email_campaigns_sent_idx
  on email_campaigns(client_id, sent_at desc)
  where status = 'sent';

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'email_campaigns_set_updated_at') then
    create trigger email_campaigns_set_updated_at
      before update on email_campaigns
      for each row execute function set_updated_at();
  end if;
end $$;

alter table email_campaigns enable row level security;

create policy "Admins manage email_campaigns" on email_campaigns
  for all using (is_admin());

-- email_specialist: read/update/insert on assigned book
create policy "email_specialist reads assigned campaigns"
  on email_campaigns for select
  using (
    has_capability('email_specialist')
    and client_id in (select assigned_client_ids())
  );

create policy "email_specialist inserts assigned campaigns"
  on email_campaigns for insert
  with check (
    has_capability('email_specialist')
    and client_id in (select assigned_client_ids())
  );

create policy "email_specialist updates assigned campaigns"
  on email_campaigns for update
  using (
    has_capability('email_specialist')
    and client_id in (select assigned_client_ids())
  )
  with check (
    has_capability('email_specialist')
    and client_id in (select assigned_client_ids())
  );

-- Strategist read-only
create policy "strategist reads assigned email_campaigns"
  on email_campaigns for select
  using (
    has_capability('strategist')
    and client_id in (select assigned_client_ids())
  );

-- Clients read their own
create policy "Clients read own email_campaigns"
  on email_campaigns for select
  using (client_id = current_client_id());

comment on table email_campaigns is
  'Email campaigns / newsletters. AI drafts body_text grounded in retrieval; human reviews subject + body; lifecycle drives scheduled → sent. Metrics flow back from the send provider after dispatch.';
