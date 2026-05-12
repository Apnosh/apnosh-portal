-- ─────────────────────────────────────────────────────────────
-- 121_client_signoff.sql
--
-- When a draft originates from a client_request and staff approves
-- it, the client should review and sign off before staff schedules.
-- These columns record that sign-off without changing the existing
-- draft.status semantics (staff 'approved' still drives the rest of
-- the lifecycle).
-- ─────────────────────────────────────────────────────────────

alter table content_drafts
  add column if not exists client_signed_off_at timestamptz;

alter table content_drafts
  add column if not exists client_signed_off_by uuid references auth.users(id) on delete set null;

-- Hot index for the client dashboard inbox query: "approved drafts
-- I originated that I haven't signed off on yet."
create index if not exists content_drafts_pending_client_review_idx
  on content_drafts(client_id, status, client_signed_off_at)
  where proposed_via = 'client_request'
    and status = 'approved'
    and client_signed_off_at is null;

comment on column content_drafts.client_signed_off_at is
  'When the client owner signed off on this draft via /dashboard/preview/[id]. NULL until they click approve.';
