-- Weekly site audit results: one row per (client_id, audit_type)
-- gets refreshed weekly by the audit cron. Older rows aren't kept;
-- we just overwrite. Page-level findings live in the jsonb payload.

create type site_audit_type as enum (
  'broken_links',
  'page_speed',
  'schema_markup',
  'stale_content'
);

create table if not exists site_audits (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  audit_type site_audit_type not null,
  /* Pass/warn/fail summary. */
  status text not null check (status in ('pass', 'warn', 'fail', 'error')),
  /* Plain-English headline ("3 broken links found"). */
  summary text not null,
  /* Per-page or per-finding detail. Shape varies by audit_type. */
  findings jsonb not null default '[]'::jsonb,
  /* Optional numeric score (0-100) for page_speed. */
  score integer,
  error text,
  ran_at timestamptz not null default now(),
  unique (client_id, audit_type)
);

create index if not exists site_audits_client_idx
  on site_audits(client_id, ran_at desc);

alter table site_audits enable row level security;

do $$ begin
  create policy "client read site_audits"
    on site_audits for select
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
  create policy "admin all site_audits"
    on site_audits for all
    using (is_admin())
    with check (is_admin());
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
