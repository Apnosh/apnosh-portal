-- ============================================================
-- Migration 073: Multi-backend site type for site_settings
-- ============================================================
-- Restaurants come to Apnosh with different needs:
--
--   - Most want a site they don't have to build/maintain. We use
--     AI (Claude) to generate one from their brand + data.
--   - Some want hand-tuned design. Apnosh team builds a custom
--     Next.js page; updates still flow through canonical data.
--   - Premium clients already have bespoke sites in their own
--     GitHub repo deployed to Vercel. We connect to that via
--     deploy hooks + a public read API.
--   - Some don't want a site through Apnosh at all -- they keep
--     their existing one and use Apnosh only for marketing ops.
--
-- This migration adds discriminator + connection fields so all
-- four cases coexist cleanly.
-- ============================================================

alter table site_settings
  add column if not exists site_type text not null default 'none'
    check (site_type in ('none', 'apnosh_generated', 'apnosh_custom', 'external_repo')),
  add column if not exists external_site_url text,
  add column if not exists external_repo_url text,
  add column if not exists external_deploy_hook_url text,
  add column if not exists external_api_key text;

comment on column site_settings.site_type is
  'Which backend renders this restaurants site. Drives whether /sites/<slug> renders, and how updates fan out to the live site.';
comment on column site_settings.external_site_url is
  'Public URL of the live site for external_repo type (e.g. https://vinasonpho.com)';
comment on column site_settings.external_repo_url is
  'GitHub repo URL for external_repo type, for reference / future GitHub integration';
comment on column site_settings.external_deploy_hook_url is
  'Vercel/Netlify deploy hook to POST to when canonical data changes, triggering a rebuild';
comment on column site_settings.external_api_key is
  'Optional shared secret used by the external site to authenticate to our public API endpoint';

create index if not exists idx_site_settings_site_type on site_settings(site_type);

-- AI-generated site designs storage. One active design per client; a
-- regenerate creates a new version. Admins can edit copy/variants
-- without losing the AI starting point.
create table if not exists client_site_designs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  version int not null default 1,
  config jsonb not null,
  generated_by text not null default 'ai' check (generated_by in ('ai', 'admin', 'mixed')),
  prompt_version text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_client_site_designs_active
  on client_site_designs(client_id) where is_active = true;
create index if not exists idx_client_site_designs_client on client_site_designs(client_id);

create or replace function client_site_designs_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_client_site_designs_updated_at on client_site_designs;
create trigger trg_client_site_designs_updated_at
  before update on client_site_designs
  for each row execute function client_site_designs_set_updated_at();

alter table client_site_designs enable row level security;

do $$ begin
  create policy "admins manage client_site_designs"
    on client_site_designs for all
    using (is_admin())
    with check (is_admin());
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "clients read their site_designs"
    on client_site_designs for select
    using (
      client_id in (
        select client_id from client_users where auth_user_id = auth.uid()
      )
    );
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
