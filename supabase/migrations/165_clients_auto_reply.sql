-- ─────────────────────────────────────────────────────────────
-- 165_clients_auto_reply.sql
--
-- Opt-in auto-reply to reviews. When on, the daily sync drafts and
-- posts an on-brand reply to NEW 5-star Google reviews automatically.
-- Off by default. Only ever touches 5-star reviews — never criticals,
-- which always need a human.
-- ─────────────────────────────────────────────────────────────

alter table clients
  add column if not exists auto_reply_five_star boolean not null default false;

comment on column clients.auto_reply_five_star is
  'When true, the daily GBP sync auto-drafts + posts replies to new 5-star Google reviews. Never touches reviews under 5 stars.';
