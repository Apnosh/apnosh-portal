-- 199: column privacy on vendors.
--
-- Migration 146's "anyone reads bookable vendors" RLS policy is ROW-level: it
-- exposed every column of a bookable vendor to anon/authenticated readers,
-- including person_id (an auth.users id) and — since 198 — stripe_account_id
-- and the negotiated platform_fee_percent. RLS cannot scope columns; column
-- GRANTs can.
--
-- Safe to tighten: every in-app vendors read goes through the service-role
-- client (get-marketplace.ts, admin pages, vendor-supply.ts — all verified),
-- which bypasses grants entirely. Only direct PostgREST access by anon/
-- authenticated is affected, and that path should never see money/identity
-- columns. NOTE: a select('*') on vendors by those roles now fails — request
-- the display columns explicitly (no in-repo caller does this today).

revoke select on table vendors from anon, authenticated;
grant select (
  id, slug, name, vendor_type, description, logo_url, cover_url,
  service_area, tier, is_apnosh, verified, avg_rating, total_bookings,
  bookable, craft, created_at, updated_at
) on table vendors to anon, authenticated;
