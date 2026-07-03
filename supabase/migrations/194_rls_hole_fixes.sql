-- ============================================================================
-- Migration 194 — Corrective security migration (REVIEWED / CORRECTED)
--
-- Fixes applied vs the proposed draft:
--   * Finding C: DROP BOTH the audit "live name" AND the repo migration name for
--     content_quotes / brand_guidelines / site_configs, so the vulnerable
--     USING-only policy can't survive a name mismatch.
--   * site_configs: KEEP the original client_users IN(...) predicate (do NOT
--     narrow to current_client_id(), which is LIMIT 1 and would lock out
--     multi-client users) and add a mirroring WITH CHECK.
--   * production_share_links: unchanged SQL, but SEE THE HARD DEPLOY DEPENDENCY
--     note — src/lib/share-link-actions.ts MUST switch to createAdminClient in
--     the SAME deploy or the public freelancer page breaks.
--
-- Ground rules: server uses SERVICE ROLE (createAdminClient) which BYPASSES RLS.
-- Helpers reused verbatim: is_admin() (001), current_client_id() (010),
-- current_user_client_id() (011), user_business_ids() (001).
-- ============================================================================


-- ┌── FINDING A — RLS OFF + anon/authenticated grants on server-only tables ──┐

-- A0. production_share_links — THE TRAP.
-- REQUIRED PAIRED CODE CHANGE (same deploy): switch getShareLinkData() and
-- createShareLink() in src/lib/share-link-actions.ts from createClient (anon) to
-- createAdminClient (service role). Token secrecy + revoked/expiry checks already
-- run in code. Without this, the public page src/app/production/[token]/page.tsx
-- reads as anon and gets zero rows -> "Link not found" for every share link.
alter table public.production_share_links enable row level security;

drop policy if exists "Admins manage production_share_links" on public.production_share_links;
create policy "Admins manage production_share_links"
  on public.production_share_links for all
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.production_share_links from anon, authenticated;


-- A1. gbp_listing_audit — service-role only. PII audit log.
alter table public.gbp_listing_audit enable row level security;
drop policy if exists "Admins read gbp_listing_audit" on public.gbp_listing_audit;
create policy "Admins read gbp_listing_audit"
  on public.gbp_listing_audit for all
  using (public.is_admin())
  with check (public.is_admin());
revoke all on public.gbp_listing_audit from anon, authenticated;


-- A2. audit_runs — service-role only.
alter table public.audit_runs enable row level security;
drop policy if exists "Admins read audit_runs" on public.audit_runs;
create policy "Admins read audit_runs"
  on public.audit_runs for all
  using (public.is_admin())
  with check (public.is_admin());
revoke all on public.audit_runs from anon, authenticated;


-- A3. customer_eye_view_runs — service-role only.
alter table public.customer_eye_view_runs enable row level security;
drop policy if exists "Admins read customer_eye_view_runs" on public.customer_eye_view_runs;
create policy "Admins read customer_eye_view_runs"
  on public.customer_eye_view_runs for all
  using (public.is_admin())
  with check (public.is_admin());
revoke all on public.customer_eye_view_runs from anon, authenticated;


-- A4. state_transitions — config table. enforce_state_transition() is plpgsql,
-- NOT security definer (084), so it runs as the caller. Leave RLS OFF and KEEP
-- the SELECT grant so the trigger's lookup is never starved; only revoke writes.
revoke insert, update, delete on public.state_transitions from anon, authenticated;


-- ┌── FINDING B — storage.objects: close cross-tenant UPDATE/DELETE ──────────┐
-- Keep public SELECT (getPublicUrl <img> srcs) and authenticated INSERT.
-- Drop the offending UPDATE/DELETE policies by predicate (created out-of-band),
-- then recreate scoped to storage.objects.owner = auth.uid().

do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename  = 'objects'
      and cmd in ('UPDATE', 'DELETE')
      and (
        qual        ilike '%''client-photos''%' or with_check ilike '%''client-photos''%'
        or qual     ilike '%''client-assets''%' or with_check ilike '%''client-assets''%'
        or qual     ilike '%''post-drafts''%'   or with_check ilike '%''post-drafts''%'
        or qual     ilike '%''video-drafts''%'  or with_check ilike '%''video-drafts''%'
      )
  loop
    execute format('drop policy if exists %I on storage.objects', pol.policyname);
  end loop;
end $$;

drop policy if exists "Owner updates own bucket objects (194)" on storage.objects;
create policy "Owner updates own bucket objects (194)"
  on storage.objects for update to authenticated
  using (
    bucket_id in ('client-photos', 'client-assets', 'post-drafts', 'video-drafts')
    and owner = auth.uid()
  )
  with check (
    bucket_id in ('client-photos', 'client-assets', 'post-drafts', 'video-drafts')
    and owner = auth.uid()
  );

drop policy if exists "Owner deletes own bucket objects (194)" on storage.objects;
create policy "Owner deletes own bucket objects (194)"
  on storage.objects for delete to authenticated
  using (
    bucket_id in ('client-photos', 'client-assets', 'post-drafts', 'video-drafts')
    and owner = auth.uid()
  );


-- ┌── FINDING C — add WITH CHECK mirroring USING (tenant-key escape) ─────────┐
-- Drop BOTH candidate names per table to survive any name mismatch, then
-- recreate ONE correct policy with a matching WITH CHECK.

-- C1. businesses (repo name = "Owners can update own business", 001; audit dup = "Owners update own business")
drop policy if exists "Owners update own business"     on public.businesses;
drop policy if exists "Owners can update own business" on public.businesses;
create policy "Owners can update own business"
  on public.businesses for update
  using       (owner_id = auth.uid())
  with check  (owner_id = auth.uid());

-- C2. deliverables "Clients update own deliverables" (001)
drop policy if exists "Clients update own deliverables" on public.deliverables;
create policy "Clients update own deliverables"
  on public.deliverables for update
  using       (business_id in (select public.user_business_ids()))
  with check  (business_id in (select public.user_business_ids()));

-- C3. form_submissions "client update own form_submissions" (130)
drop policy if exists "client update own form_submissions" on public.form_submissions;
create policy "client update own form_submissions"
  on public.form_submissions for update
  using (
    client_id in (
      select b.client_id  from businesses b   where b.owner_id      = auth.uid()
      union
      select cu.client_id from client_users cu where cu.auth_user_id = auth.uid()
    )
  )
  with check (
    client_id in (
      select b.client_id  from businesses b   where b.owner_id      = auth.uid()
      union
      select cu.client_id from client_users cu where cu.auth_user_id = auth.uid()
    )
  );

-- C4. site_configs (repo name = "site_configs: client_user update own", 079;
-- audit name = "Clients update own site_configs"). KEEP the IN(...) predicate;
-- do NOT narrow to current_client_id() (LIMIT 1 would lock out multi-client users).
drop policy if exists "site_configs: client_user update own" on public.site_configs;
drop policy if exists "Clients update own site_configs"      on public.site_configs;
create policy "site_configs: client_user update own"
  on public.site_configs for update
  using (
    client_id in (select client_id from client_users where auth_user_id = auth.uid())
  )
  with check (
    client_id in (select client_id from client_users where auth_user_id = auth.uid())
  );

-- C5. content_quotes (repo name = "Clients respond to own content_quotes", 095;
-- audit name = "Clients respond"). WITH CHECK pins only the tenant key so a client
-- can still respond a row out of ('sent','revising'); USING gates which rows.
drop policy if exists "Clients respond to own content_quotes" on public.content_quotes;
drop policy if exists "Clients respond"                       on public.content_quotes;
create policy "Clients respond to own content_quotes"
  on public.content_quotes for update
  using       (client_id = public.current_client_id() and status in ('sent', 'revising'))
  with check  (client_id = public.current_client_id());

-- C6. brand_guidelines (repo name = "Clients update own guidelines", 004;
-- audit name = "Clients update"). Predicate mirrors 004 (owner lookup).
drop policy if exists "Clients update own guidelines" on public.brand_guidelines;
drop policy if exists "Clients update"                on public.brand_guidelines;
create policy "Clients update own guidelines"
  on public.brand_guidelines for update
  using       (business_id in (select id from businesses where owner_id = auth.uid()))
  with check  (business_id in (select id from businesses where owner_id = auth.uid()));

-- C7. asset_folders "Client manages own asset_folders" (FOR ALL, 020)
drop policy if exists "Client manages own asset_folders" on public.asset_folders;
create policy "Client manages own asset_folders"
  on public.asset_folders for all
  using       (client_id = public.current_client_id())
  with check  (client_id = public.current_client_id());

-- C8. calendar_share_links "Client manages own calendar_share_links" (FOR ALL, 020)
drop policy if exists "Client manages own calendar_share_links" on public.calendar_share_links;
create policy "Client manages own calendar_share_links"
  on public.calendar_share_links for all
  using       (client_id = public.current_client_id())
  with check  (client_id = public.current_client_id());

-- C9. profiles "Users can update own profile" (001; role trigger-guarded by 193)
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using       (id = auth.uid())
  with check  (id = auth.uid());

-- C10. notifications "Users update own" already carries WITH CHECK (122). NO CHANGE.


-- ┌── FINDING D — pin search_path on SECURITY DEFINER RLS helpers ────────────┐
-- Both identify the caller by auth.uid() (NOT current_user) -> no 192 bug.
-- Pure hardening; bodies match 010/011 verbatim.

create or replace function public.current_user_client_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select client_id from public.businesses where owner_id = auth.uid() limit 1;
$$;

create or replace function public.current_client_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select client_id from public.client_users where auth_user_id = auth.uid() limit 1;
$$;


notify pgrst, 'reload schema';