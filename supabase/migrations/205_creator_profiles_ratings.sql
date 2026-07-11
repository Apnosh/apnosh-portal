-- 205: creator profiles + delivered-work ratings (Phase D creator layer).
--
-- PROFILES: the creator identity already lives on `vendors` (migration 146 +
-- craft/stripe columns in 198), so no duplicate columns are added here:
--   display name  -> vendors.name
--   bio           -> vendors.description
--   craft         -> vendors.craft (the dispatch key; text, one per vendor)
--   avatar        -> vendors.logo_url
--   portfolio     -> vendor_portfolio_items (migration 148, its own table + bucket)
--   status        -> vendors.bookable (active/paused) + vendor_applications (invited)
-- The admin Creators surface (/admin/vendors) edits these existing fields.
--
-- RATINGS: work_ratings is NEW — one rating per delivered creator work order,
-- written by the paying client after they review the delivery. This is the only
-- honest rating source in the system: no seeds, no samples, aggregates are
-- computed live from these rows only. vendors.avg_rating (146) stays untouched
-- (it belongs to the marketplace booking flow); the creator layer reads
-- work_ratings directly.
--
-- work_order_id / campaign_id are ON DELETE SET NULL (not cascade), same lesson
-- as creator_payouts (181): deleting a campaign must never erase a creator's
-- earned track record.
--
-- RLS follows the creator_work_orders idiom (171): admin full via is_admin();
-- a creator may read their own ratings through vendors.person_id. Owner writes
-- and reads go through the server (service role) behind checkClientAccess in
-- /api/dashboard/work-rating — the same route-layer gate creator_work_orders
-- and creator_payouts use for owner-side access.

create table if not exists work_ratings (
  id            uuid primary key default gen_random_uuid(),
  work_order_id uuid references creator_work_orders(id) on delete set null,
  creator_id    text not null,                              -- vendor UUID as text (matches creator_work_orders.creator_id)
  client_id     uuid not null references clients(id) on delete cascade,
  campaign_id   uuid references campaigns(id) on delete set null,
  stars         int  not null check (stars >= 1 and stars <= 5),
  comment       text,
  created_at    timestamptz not null default now()
);

-- One rating per delivered order (partial: survives an order deletion nulling the fk).
create unique index if not exists work_ratings_work_order
  on work_ratings (work_order_id) where work_order_id is not null;
create index if not exists work_ratings_creator on work_ratings (creator_id);
create index if not exists work_ratings_client on work_ratings (client_id);

alter table work_ratings enable row level security;

do $$ begin
  create policy work_ratings_admin on work_ratings
    for all using (is_admin()) with check (is_admin());
exception when duplicate_object then null; end $$;

-- A creator sees their own ratings (their vendor row's person_id is them).
do $$ begin
  create policy work_ratings_own_read on work_ratings
    for select using (
      creator_id in (select v.id::text from vendors v where v.person_id = auth.uid())
    );
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';
