-- Catalog visibility override (Phase 1 of the servicable-catalog cleanup).
--
-- Lets an admin override, per campaign, whether a store card is buyable. The CODE default lives in
-- src/lib/campaigns/data/catalog-availability.ts (the Phase A bookmark decision); this column only
-- exists so the CMS can flip a built-in later without a deploy. NULL = use the code default.
--
-- Allowed values: 'live' (buyable), 'coming_soon' (visible, buy disabled), 'hidden' (removed from
-- the browse). Any other value is rejected. The store reads this through the same content-override
-- map it already fetches (catalog_content_overrides), so no new read path is needed.
--
-- Safe to run more than once (idempotent guards throughout). No data change: existing rows get NULL,
-- which means "use the code default", so the catalog behaves exactly as the committed code decides.

alter table catalog_content_overrides
  add column if not exists visibility text;

do $$ begin
  alter table catalog_content_overrides
    add constraint catalog_content_overrides_visibility_chk
    check (visibility is null or visibility in ('live', 'coming_soon', 'hidden'));
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
