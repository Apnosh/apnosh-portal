-- 208_catalog_lanes — per-card delivery lanes for the customer product page.
--
-- Each catalog card can offer its own set of "who does it" lanes (Fiverr-style packages):
-- DIY, Apnosh AI, done-for-you (Apnosh or contractor), or custom — each with its OWN price,
-- requirements, and add-ons. NULL = the card uses the default lane behavior (unchanged), so
-- adding this column is backward-compatible and every existing card keeps working as-is.
--
-- Shape (jsonb array), enforced in TS (src/lib/campaigns/data/priced-catalog.ts CardLane):
--   [
--     {
--       "id": "diy",                         -- stable key
--       "label": "I'll do it myself",         -- shown on the lane tab
--       "kind": "diy",                        -- diy | ai | team | creator  (drives producer + pricing)
--       "price": { "amount": 0, "kind": "one-time" } | null,  -- null = free; ai lanes may be Pro-gated
--       "proOnly": false,                     -- AI lane free for Pro
--       "requirements": ["Connect your Google profile"],
--       "addOns": [ { "label": "Extra photo set", "amount": 120, "kind": "one-time" } ],
--       "note": "We do it for you, start to finish."
--     }
--   ]
alter table catalog_services
  add column if not exists lanes jsonb;

comment on column catalog_services.lanes is
  'Per-card delivery lanes (Fiverr-style): [{id,label,kind(diy|ai|team|creator),price,proOnly,requirements[],addOns[],note}]. NULL = default lane behavior.';
