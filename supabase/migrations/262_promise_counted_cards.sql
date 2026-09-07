-- 262: the card a KEPT PROMISE makes, and the words it can be re-drawn from.
--
-- A win used to be "any mint card with a number on it": a Google week that rose on its own, a
-- post that did well, a review month. All true, all news, and none of them a promise anybody
-- bought. The card says "Counted by Apnosh" at the foot and the owner sends it to a friend, so
-- that line has to be earned. From here a win is one thing: an order whose promised count came
-- in with a real number behind it (order_promises, migration 253).
--
-- 1. card_type 'promise_counted'. Composed once per promise by the count-is-in cron, keyed
--    card_key = 'promise:<promise id>', which is the natural idempotency key proof_cards already
--    has a unique index on. Until this file runs the insert is refused by the check constraint,
--    the cron warns and says which SQL is missing, and nothing else about the run changes.
--
-- 2. proof_cards.metadata. The card carries the KEY of each of its three lines plus the numbers
--    that fill them, not only the finished English. That is what lets the owner's own page and
--    the public /w/<token> page draw the card in Spanish without asking the ledger for the number
--    a second time — a card is a snapshot of the day its count came in, and a link somebody was
--    already sent has to keep saying what it said when it was sent. It also carries the order the
--    card came from (campaign or request), so staff can walk back from a card to the work.
--    jsonb, nullable: every card written before today has none and reads exactly as it always did.
--
-- Tenancy: no new table, nothing keyed on business_id. proof_cards is already keyed on client_id.
-- Applied by hand in the Supabase SQL editor (project_supabase_migrations).

alter table proof_cards drop constraint if exists proof_cards_card_type_check;
alter table proof_cards add constraint proof_cards_card_type_check
  check (card_type in (
    'gbp_week', 'post', 'reviews', 'gbp_down', 'campaign_moved', 'social_month', 'site_week',
    'promise_counted'
  ));

alter table proof_cards add column if not exists metadata jsonb;

comment on column proof_cards.metadata is
  'How this card is re-drawn: {words:{label,big,context}} as i18n key + vars, plus the promise and order it came from. Null on every card written before migration 262.';

-- PostgREST caches the schema; without this the new column reads as missing until it reloads.
notify pgrst, 'reload schema';
