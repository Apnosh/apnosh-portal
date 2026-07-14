-- 210_content_override_stages — let admin re-tag a built-in campaign's funnel chips
-- from the campaign editor. The product page shows these as the "Awareness / Actions"
-- style tags at the top; NULL keeps the campaign's built-in stages.
--
-- Stored as a JSON array of funnel-stage ids (["aware","actions"]). The store reads it
-- for the PDP chip row + which analytics show; the deeper funnel/plan logic keeps using
-- the built-in stages, so re-tagging a card is display-only and safe.
alter table catalog_content_overrides
  add column if not exists stages jsonb;

comment on column catalog_content_overrides.stages is 'Funnel chips on the product page (["aware","actions",...]). NULL = the campaign''s built-in stages.';
