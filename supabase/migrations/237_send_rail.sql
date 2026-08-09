-- ─────────────────────────────────────────────────────────────
-- 237: THE SEND RAIL — email campaigns get real plumbing.
--
-- Nine store cards wait on this one build. Three pieces:
--   * guest_contacts — the client's own list (import first,
--     capture rail later). Unsubscribes are honored forever.
--   * email_sends — one row per contact per email draft, the
--     receipt + idempotency ledger (a retry can never double-
--     send to someone already sent).
--   * content_drafts.email_subject — an email piece is a draft
--     with target_platforms = {email} plus a subject line; the
--     body rides the existing caption column so the whole
--     approve/sign-off/schedule spine applies unchanged.
--
-- Sending itself is FAIL CLOSED behind EMAIL_SEND_ENABLED
-- (same kill-switch pattern as the campaign checkout).
-- ─────────────────────────────────────────────────────────────

alter table public.content_drafts
  add column if not exists email_subject text;

create table if not exists public.guest_contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  email text not null,
  name text,
  source text not null default 'import'
    check (source in ('import', 'capture', 'manual')),
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists guest_contacts_client_email
  on public.guest_contacts (client_id, lower(email));

alter table public.guest_contacts enable row level security;

do $$ begin
  create policy guest_contacts_admin
    on public.guest_contacts for all
    using (is_admin()) with check (is_admin());
exception when duplicate_object then null; end $$;

-- Owners read their own list. Writes go through the server API
-- (service role) so validation and dedupe cannot be skipped.
do $$ begin
  create policy guest_contacts_client_read
    on public.guest_contacts for select
    using (
      client_id in (
        select client_id from public.client_users where auth_user_id = auth.uid()
        union
        select client_id from public.businesses where owner_id = auth.uid()
      )
    );
exception when duplicate_object then null; end $$;

create table if not exists public.email_sends (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.content_drafts(id) on delete cascade,
  client_id uuid not null,
  contact_id uuid not null references public.guest_contacts(id) on delete cascade,
  email text not null,
  status text not null check (status in ('sent', 'failed')),
  provider_id text,
  error text,
  created_at timestamptz not null default now(),
  unique (draft_id, contact_id)
);

create index if not exists email_sends_client_idx
  on public.email_sends (client_id, created_at desc);

alter table public.email_sends enable row level security;

do $$ begin
  create policy email_sends_admin
    on public.email_sends for all
    using (is_admin()) with check (is_admin());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy email_sends_client_read
    on public.email_sends for select
    using (
      client_id in (
        select client_id from public.client_users where auth_user_id = auth.uid()
        union
        select client_id from public.businesses where owner_id = auth.uid()
      )
    );
exception when duplicate_object then null; end $$;
