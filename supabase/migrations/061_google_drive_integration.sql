-- ============================================================
-- Migration 061: Google Drive integration
-- ============================================================
-- Phase 1 of the Drive integration:
--   1. A single-row-per-provider `integrations` table for storing
--      admin-level OAuth tokens (not per-client). This is the Apnosh
--      team's Drive — one grant covers everyone.
--   2. `drive_folder_id` + `drive_folder_url` on clients so each client
--      can be linked to a specific folder.
--
-- Deliberately NOT adding client-level OAuth — all clients' files come
-- out of Apnosh's own Drive, so one grant is enough.
-- ============================================================

create table integrations (
  id uuid primary key default gen_random_uuid(),
  provider text not null unique check (provider in ('google_drive')),

  -- Token fields. access_token is short-lived; refresh_token is what
  -- actually gives us long-term access.
  access_token text not null,
  refresh_token text,
  token_expires_at timestamptz,

  -- Provider-specific metadata (email of granter, scopes, etc.)
  metadata jsonb not null default '{}',

  granted_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_integrations_provider on integrations(provider);

-- Admin-only table. No RLS policy for non-admins; service role bypasses.
alter table integrations enable row level security;

create policy "admin full access on integrations"
  on integrations for all
  to authenticated
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- Link a Drive folder to each client. folder_url is stored as a
-- convenience so we can render a "Open in Drive" link without
-- reconstructing it.
alter table clients
  add column if not exists drive_folder_id text,
  add column if not exists drive_folder_url text;

create index if not exists idx_clients_drive_folder on clients(drive_folder_id)
  where drive_folder_id is not null;

comment on column clients.drive_folder_id is
  'Google Drive folder ID for this client''s files. Powers the Docs tab, Brand assets, and Profile AI-extract flow.';
