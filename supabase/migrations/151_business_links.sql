-- Business links: online ordering, reservations, and social profiles.
--
-- Owners manage these in the business-info hub. Stored as one jsonb on
-- the primary location and served by /api/public/sites/[slug] so the
-- website can render order/reserve buttons + social icons. Shape:
--   {
--     "ordering":     [{ "label": "DoorDash", "url": "https://..." }],
--     "reservations": [{ "label": "OpenTable", "url": "https://..." }],
--     "social":       { "instagram": "https://...", "facebook": "...", ... }
--   }

alter table gbp_locations add column if not exists links jsonb not null default '{}'::jsonb;

comment on column gbp_locations.links is
  'Owner-managed links: { ordering[], reservations[], social{} }. Served to the website via the public sites API.';
