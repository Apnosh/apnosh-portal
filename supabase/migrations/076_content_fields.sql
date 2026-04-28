-- ============================================================
-- Migration 076: Client Content Fields
-- ============================================================
-- Editable copy on each customer site (hero subheads, taglines,
-- about paragraphs, CTA labels). Each field's editability is
-- defined by a schema living in the customer's site repo
-- (apnosh-content.json). This table stores the override values
-- that clients have published through the portal.
--
-- Design model:
--   - Schema (what's editable, length limits, voice rules) lives
--     in the customer site repo. The portal fetches it at edit time.
--   - Values (what the client typed) live here. The customer site
--     pulls these via the public API at build time, falling back
--     to its own default copy if no override exists.
--   - Voice-check overrides are logged so the AI learns the
--     client's evolving voice over time (override = signal).
-- ============================================================

create table if not exists client_content_fields (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  -- Field key as defined in the customer site's apnosh-content.json schema,
  -- e.g. 'hero.subhead', 'footer.tagline'. Dotted notation is convention.
  field_key text not null,
  -- The current published value the customer site renders.
  value text not null,
  -- Audit
  last_edited_by uuid references auth.users(id),
  last_edited_at timestamptz not null default now(),
  -- Voice-check override tracking. When a client publishes a value despite
  -- a voice warning, we increment this and record the warning text. Useful
  -- for AI voice-evolution learning.
  voice_overrides jsonb not null default '[]',
  created_at timestamptz not null default now(),

  unique(client_id, field_key)
);

create index if not exists idx_content_fields_client on client_content_fields(client_id);

alter table client_content_fields enable row level security;

create policy "admins manage content_fields"
  on client_content_fields for all using (is_admin()) with check (is_admin());

create policy "clients manage their content_fields"
  on client_content_fields for all using (
    client_id in (
      select client_id from client_users where auth_user_id = auth.uid()
    )
  ) with check (
    client_id in (
      select client_id from client_users where auth_user_id = auth.uid()
    )
  );

notify pgrst, 'reload schema';
