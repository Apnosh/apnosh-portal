-- 198: real contractor supply (NEXT-5).
--
-- vendors.craft is the dispatch key: which creative discipline this vendor
-- makes, in the same vocabulary as the internal pool (creators.ts Disc). Null
-- means not auto-dispatchable — the internal team keeps the work.
--
-- vendors.stripe_account_id is the Stripe Connect destination for payouts
-- (null until the vendor onboards; transfers are env-gated in code).
--
-- creator_work_orders.prior_creator_ids records every maker who declined the
-- piece, so auto-reassignment never re-offers work to someone who said no and
-- a bounce cap can stop creator ping-pong.
--
-- All additive and inert until the code that writes them deploys.

alter table vendors add column if not exists craft text
  check (craft in ('Video', 'Photo', 'Social', 'Design'));
alter table vendors add column if not exists stripe_account_id text;

create index if not exists idx_vendors_craft on vendors (craft) where craft is not null;

alter table creator_work_orders add column if not exists prior_creator_ids text[] not null default '{}';
