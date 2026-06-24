-- Owner execution inputs collected on the post-ship "Get it ready" screen:
-- the specifics that make the creative brief accurate (the exact dish to
-- feature, the offer wording, must-say / avoid notes, timing preference).
-- Flows into getCreatorBrief so what the owner types here becomes the dish in
-- the creator's shot list and the copy in the caption.
--
-- Shape: { featuring, offerText, mustSay, avoid, postNotes } — all optional.

alter table campaigns add column if not exists execution jsonb not null default '{}'::jsonb;
