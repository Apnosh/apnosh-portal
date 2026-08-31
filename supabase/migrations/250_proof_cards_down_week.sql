-- 250: the down-week card type. Transparency with a move attached:
-- meaningful drops fire a visually distinct heads-up card that leads with
-- the action, at most one per 14 days, never alongside a win.
alter table proof_cards drop constraint if exists proof_cards_card_type_check;
alter table proof_cards add constraint proof_cards_card_type_check
  check (card_type in ('gbp_week', 'post', 'reviews', 'gbp_down'));
