-- Hybrid production: per-piece producer choice. For each creative piece the owner
-- decides who makes it — their in-house team (→ content_drafts, worked in /work)
-- or a marketplace creator (→ a creator_work_order + brief). Keyed by the piece's
-- discipline:slot (e.g. { "Video:0": "team", "Video:1": "creator" }); a piece with
-- no entry uses the marketplace default. This is what lets the ship route each
-- piece to exactly ONE producer instead of minting it to both lanes at once.

alter table campaigns add column if not exists producer_choices jsonb not null default '{}'::jsonb;
