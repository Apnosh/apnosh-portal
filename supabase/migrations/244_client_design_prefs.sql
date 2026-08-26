-- The owner's usual for graphic orders (ask-once law): who makes it and the
-- brand choice, remembered from the last placed order, never locked.
alter table clients add column if not exists design_prefs jsonb;
