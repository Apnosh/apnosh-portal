-- 184 — Shoot Day: record the solo-visit surcharge on a creator order.
--
-- A lone on-site creator piece carries a $75 solo-visit surcharge folded into its
-- amount_cents (the owner pays it). The CREATOR is paid on the piece only — the
-- surcharge is Apnosh's trip-cost recovery — so the payout split must net it out.
-- We persist the surcharge portion here so accruePayoutForApprovedOrder can subtract
-- it from gross while the owner charge keeps the full amount. Additive + defaulted, so
-- every existing order reads 0 (no surcharge) and legacy payouts are unchanged.

ALTER TABLE creator_work_orders ADD COLUMN IF NOT EXISTS surcharge_cents integer NOT NULL DEFAULT 0;
