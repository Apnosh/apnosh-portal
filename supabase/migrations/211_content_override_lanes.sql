-- 211_content_override_lanes — let admin edit a campaign's "how it's done" lanes
-- (the I'll do it / Apnosh AI / Apnosh tabs) from the campaign page builder.
--
-- Stored as a JSON array [{label, price, pro, detail}]. DISPLAY/DRAFT ONLY for now:
-- the store keeps billing on its built-in lanes; this column just holds the owner's
-- edited lane design so the builder + preview can show it. Wiring lane prices to
-- checkout is a later, deliberate step.
alter table catalog_content_overrides
  add column if not exists lanes jsonb;

comment on column catalog_content_overrides.lanes is 'Edited "how it''s done" lanes [{label,price,pro,detail}]. Draft/display only; not wired to billing yet. NULL = built-in lanes.';
