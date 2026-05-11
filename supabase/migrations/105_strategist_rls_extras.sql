-- ─────────────────────────────────────────────────────────────
-- 105_strategist_rls_extras.sql
--
-- Extends strategist read scope to remaining tables touched by the
-- client drill-in page (/admin/clients/[slug]). Without these, a
-- non-admin strategist sees an empty page even though they're
-- allowed in.
--
-- Schema reality (verified):
--   client_id:   client_goals, client_locations, invoices, brand_guidelines
--   business_id: messages, message_threads, agreements, brand_assets
--                (and brand_guidelines)
--
-- We add a SELECT policy per table, scoped by whichever FK exists.
-- ─────────────────────────────────────────────────────────────

-- ── client_id-based tables ────────────────────────────────────

drop policy if exists "strategist reads assigned goals" on client_goals;
create policy "strategist reads assigned goals"
  on client_goals for select
  using (
    has_capability('strategist')
    and client_id in (select assigned_client_ids())
  );

drop policy if exists "strategist reads assigned locations" on client_locations;
create policy "strategist reads assigned locations"
  on client_locations for select
  using (
    has_capability('strategist')
    and client_id in (select assigned_client_ids())
  );

drop policy if exists "strategist reads assigned invoices" on invoices;
create policy "strategist reads assigned invoices"
  on invoices for select
  using (
    has_capability('strategist')
    and client_id in (select assigned_client_ids())
  );

drop policy if exists "strategist reads assigned brand guidelines" on brand_guidelines;
create policy "strategist reads assigned brand guidelines"
  on brand_guidelines for select
  using (
    has_capability('strategist')
    and (
      client_id in (select assigned_client_ids())
      or business_id in (
        select id from businesses where client_id in (select assigned_client_ids())
      )
    )
  );

-- ── business_id-based tables ──────────────────────────────────

drop policy if exists "strategist reads assigned messages" on messages;
create policy "strategist reads assigned messages"
  on messages for select
  using (
    has_capability('strategist')
    and business_id in (
      select id from businesses where client_id in (select assigned_client_ids())
    )
  );

drop policy if exists "strategist reads assigned threads" on message_threads;
create policy "strategist reads assigned threads"
  on message_threads for select
  using (
    has_capability('strategist')
    and business_id in (
      select id from businesses where client_id in (select assigned_client_ids())
    )
  );

drop policy if exists "strategist reads assigned agreements" on agreements;
create policy "strategist reads assigned agreements"
  on agreements for select
  using (
    has_capability('strategist')
    and business_id in (
      select id from businesses where client_id in (select assigned_client_ids())
    )
  );

drop policy if exists "strategist reads assigned brand assets" on brand_assets;
create policy "strategist reads assigned brand assets"
  on brand_assets for select
  using (
    has_capability('strategist')
    and business_id in (
      select id from businesses where client_id in (select assigned_client_ids())
    )
  );
