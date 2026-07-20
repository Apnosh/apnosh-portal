-- Backfill campaign_line_items.producer where it was never set.
--
-- WHY: `producer` was optional, and serviceToLine / serviceToLines never stamped it, so most
-- service lines persisted as NULL. Every consumer happens to test `producer <> 'diy'`, which made
-- NULL behave exactly like 'team' — correct by accident, never by design. Two real problems came
-- out of that: the campaign completion gate tested `producer = 'diy'` positively and so could never
-- complete an AI-lane or NULL-producer campaign, and any future consumer writing the natural
-- `producer = 'team'` test would silently skip every legacy line.
--
-- WHAT: set the value that the code already means today. This is BEHAVIOUR-PRESERVING — it writes
-- down the meaning NULL already had at every branch point, and changes no live behaviour.
--
-- SAFETY: only touches rows where producer IS NULL, so a line the owner/AI/creator lane already
-- stamped ('diy', 'ai', 'creator', 'team') is never overwritten. Idempotent: re-running matches
-- nothing the second time.
--
-- Going forward, serviceToLine/serviceToLines always stamp 'team', so new lines are never unset.
-- See src/lib/campaigns/doers.ts for the single canonical producer -> doer reading.

update campaign_line_items
   set producer = 'team'
 where producer is null;

notify pgrst, 'reload schema';
