-- Form submissions from the client's website. Captured via webhook
-- (any form provider that can POST JSON works: native HTML forms,
-- Typeform, Formspree, Tally, custom). Each row is one submission.
--
-- Status flow:
--   new       — just arrived, owner hasn't seen it
--   read      — owner opened the detail view
--   replied   — owner / strategist responded out-of-band
--   archived  — done with it

create type form_submission_status as enum ('new', 'read', 'replied', 'archived');

create type form_submission_kind as enum (
  'contact',        -- generic "get in touch"
  'catering',       -- catering inquiry
  'reservation',    -- private events / group reservation
  'newsletter',     -- email signup
  'feedback',       -- review/feedback form
  'job_inquiry',    -- careers
  'other'
);

create table if not exists form_submissions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  kind form_submission_kind not null default 'other',
  /* Best-effort display name extracted from the payload (name field, etc.). */
  display_name text,
  display_email text,
  display_phone text,
  /* Source URL the form was submitted from. */
  source_url text,
  /* Full normalized payload — flat key/value pairs of every form field. */
  fields jsonb not null default '{}'::jsonb,
  status form_submission_status not null default 'new',
  /* Notes the owner / strategist adds while handling. */
  notes text,
  submitted_at timestamptz not null default now(),
  read_at timestamptz,
  replied_at timestamptz,
  archived_at timestamptz
);

create index if not exists form_submissions_client_idx
  on form_submissions(client_id, submitted_at desc);

create index if not exists form_submissions_status_idx
  on form_submissions(client_id, status) where status in ('new', 'read');

alter table form_submissions enable row level security;

do $$ begin
  create policy "client read form_submissions"
    on form_submissions for select
    using (
      client_id in (
        select b.client_id from businesses b where b.owner_id = auth.uid()
        union
        select cu.client_id from client_users cu where cu.auth_user_id = auth.uid()
      )
    );
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "client update own form_submissions"
    on form_submissions for update
    using (
      client_id in (
        select b.client_id from businesses b where b.owner_id = auth.uid()
        union
        select cu.client_id from client_users cu where cu.auth_user_id = auth.uid()
      )
    );
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "admin all form_submissions"
    on form_submissions for all
    using (is_admin())
    with check (is_admin());
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
