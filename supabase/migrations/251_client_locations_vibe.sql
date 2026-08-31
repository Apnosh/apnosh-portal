-- 251: per-location vibe (service styles). A spot can be fine dining while
-- its sibling is fast casual; NULL inherits the business default (248 pattern).
alter table client_locations add column if not exists service_styles jsonb;
comment on column client_locations.service_styles is
  'Override, e.g. ["Bar / lounge","Casual dining"]. NULL = inherits the business vibe.';
