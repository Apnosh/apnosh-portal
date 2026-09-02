-- 252: three more result card families (owner ask 2026-09-02):
--   campaign_moved  a campaign's Google number rose in the two weeks after launch
--   social_month    followers gained across networks in the last 30 days
--   site_week       website visitors up week over week
alter table proof_cards drop constraint if exists proof_cards_card_type_check;
alter table proof_cards add constraint proof_cards_card_type_check
  check (card_type in ('gbp_week', 'post', 'reviews', 'gbp_down', 'campaign_moved', 'social_month', 'site_week'));
