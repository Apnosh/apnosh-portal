-- Atomic dedup for marketplace BOOKING work orders.
--
-- Campaign orders are deduped by the unique index on (campaign_id, discipline, slot). But booking
-- orders carry campaign_id = NULL, and Postgres treats NULL as DISTINCT in a unique index, so that
-- index gives booking orders ZERO protection. Their stable key lives in campaign_piece_key
-- ('booking:<id>' for one-shot shapes, 'booking:<id>#<month>' for recurring months), which is unique
-- per booking/month. Without a DB-level guard, the mint's check-then-insert can double-mint under
-- concurrency (a double-clicked Accept, or a subscribe overlapping the monthly cron), and each
-- duplicate order independently accrues its own charge + payout → double bill + double pay.
--
-- This partial unique index makes those concurrent mints safe: the second insert raises 23505 and
-- mintBookingWorkOrder returns the order the first insert created (idempotent). Only booking rows are
-- covered (campaign_id is null), so campaign orders are untouched.
create unique index if not exists creator_work_orders_booking_key
  on creator_work_orders (campaign_piece_key)
  where campaign_id is null and campaign_piece_key is not null;
