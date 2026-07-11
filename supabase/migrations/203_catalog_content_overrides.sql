-- Campaign content overrides (Phase C1 of the campaign-catalog systemization).
-- One row per EDITED store campaign. item_id is a CreateCatalogId from
-- src/lib/campaigns/data/create-catalog.ts; the in-code CAMPAIGN_CONTENT record
-- (src/lib/campaigns/data/campaign-content.ts) stays the canonical default.
-- Every content column is nullable: NULL means "use the code default". A row
-- only exists once the admin edits something, so an untouched catalog has an
-- empty table and the store renders pure code content.
-- Served through the admin client (service role), so RLS just locks out any
-- direct client/anon access.
create table if not exists catalog_content_overrides (
  item_id text primary key,
  title text,
  tagline text,
  description text,
  promise text,
  why text,
  expectation text,
  /* public URL in the client-graphics storage bucket (catalog-content/ folder) */
  hero_image text,
  best_for text,
  /* [{ "q": string, "a": string }] */
  faq jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table catalog_content_overrides enable row level security;

do $$ begin
  create policy "admin all catalog_content_overrides"
    on catalog_content_overrides for all
    using (is_admin())
    with check (is_admin());
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
