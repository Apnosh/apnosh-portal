-- 239: allow youtube in social_metrics
--
-- The social vendor lane (zernio/ayrshare) now links YouTube channels, but
-- social_metrics' platform CHECK (026) only allowed the original four — so
-- Postgres would reject every youtube row the nightly sync writes. Same bug
-- class as the hosted_link constraint (238): the pipe was built, the CHECK
-- said no. Widen it.

alter table social_metrics drop constraint if exists social_metrics_platform_check;
alter table social_metrics add constraint social_metrics_platform_check
  check (platform in ('instagram', 'facebook', 'tiktok', 'linkedin', 'youtube'));
