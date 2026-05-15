-- Extend ad_campaigns for multi-objective campaign types.
-- Until now everything was a "boost a post" campaign. As Apnosh scales
-- toward 10K+ restaurants the strategist workflow needs more objectives:
--   - post_boost      (existing) -- amplify an organic post
--   - reels_boost     amplify a Reel specifically (different ad units in Meta)
--   - foot_traffic    drive store visits via location-aware targeting
--   - reservations    drive bookings via website / OpenTable / Resy
--   - lead_gen        capture emails via Meta Lead Ads
--   - awareness       top-of-funnel reach campaigns
--
-- The strategist picks the objective in the admin /admin/ads pipeline.
-- Each maps to a different Meta Ads Manager campaign objective + template.

alter table ad_campaigns
  add column if not exists campaign_type text not null default 'post_boost';

alter table ad_campaigns
  drop constraint if exists ad_campaigns_campaign_type_check;

alter table ad_campaigns
  add constraint ad_campaigns_campaign_type_check
  check (campaign_type in (
    'post_boost',
    'reels_boost',
    'foot_traffic',
    'reservations',
    'lead_gen',
    'awareness'
  ));

create index if not exists idx_ad_campaigns_campaign_type on ad_campaigns(campaign_type);
create index if not exists idx_ad_campaigns_status_client on ad_campaigns(status, client_id);

comment on column ad_campaigns.campaign_type is
  'Meta Ads objective category. Drives which campaign template the strategist applies and which audience presets are relevant.';
