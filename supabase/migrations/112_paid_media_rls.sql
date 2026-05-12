-- ─────────────────────────────────────────────────────────────
-- 112_paid_media_rls.sql
--
-- Row-level access for the paid_media capability on ad_campaigns and
-- social_posts. Mirrors the strategist policies in 104 but scoped to
-- the paid buyer's needs: they read campaigns + organic outcomes on
-- their book, and they update campaigns to drive the launch / pause
-- / complete lifecycle. Inserts come through the existing admin path
-- (POST /api/social/boost), so no insert policy added here.
-- ─────────────────────────────────────────────────────────────

-- ad_campaigns: read + update on assigned book
drop policy if exists "paid_media reads assigned campaigns" on ad_campaigns;
create policy "paid_media reads assigned campaigns"
  on ad_campaigns for select
  using (
    has_capability('paid_media')
    and client_id in (select assigned_client_ids())
  );

drop policy if exists "paid_media updates assigned campaigns" on ad_campaigns;
create policy "paid_media updates assigned campaigns"
  on ad_campaigns for update
  using (
    has_capability('paid_media')
    and client_id in (select assigned_client_ids())
  )
  with check (
    has_capability('paid_media')
    and client_id in (select assigned_client_ids())
  );

-- social_posts: read on assigned book (needed to find boost opportunities
-- and to score outcomes for AI recommendations).
drop policy if exists "paid_media reads assigned social_posts" on social_posts;
create policy "paid_media reads assigned social_posts"
  on social_posts for select
  using (
    has_capability('paid_media')
    and client_id in (select assigned_client_ids())
  );
