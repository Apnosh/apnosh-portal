-- 214_content_override_rush — a per-campaign rush option, editable in the campaign builder.
-- Stored as JSON { fee, days }: a flat fee to deliver `days` business days sooner. The cart
-- shows it as a per-item "Get it faster" upsell. DRAFT/DISPLAY ONLY for now — the fee is shown
-- in the cart + order total but not yet billed; wiring rush into checkout is a later step.
alter table catalog_content_overrides
  add column if not exists rush jsonb;

comment on column catalog_content_overrides.rush is 'Rush option { fee, days } — flat fee to deliver `days` sooner. Draft/display only; not billed yet. NULL = no rush.';
