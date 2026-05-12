-- Client-side "add this specialist to my team" requests.
--
-- Mirrors swap_requests in shape but expresses the inverse intent:
-- the client wants to ADD a person to a role rather than swap an
-- existing one out. The strategist mediates — for marketplace
-- specialists, Sarah generates the quote (which lands in
-- Needs approval as a 'quote' deliverable, per existing pattern).
--
-- A specialist being requested NEVER sees the request — same privacy
-- model as swap_requests. RLS hides it from anyone outside the client +
-- admins.

create table if not exists add_specialist_requests (
  id                       uuid primary key default gen_random_uuid(),
  client_id                uuid not null references clients(id) on delete cascade,
  proposed_specialist_id   uuid not null references auth.users(id) on delete cascade,
  /* What role(s) the client wants this person to play on their
     account. Empty array means "Sarah, pick what makes sense." */
  proposed_roles           role_capability[] not null default '{}',
  requested_by             uuid not null references auth.users(id),
  requested_at             timestamptz not null default now(),
  /* Free-text "anything Sarah should know" — voice memo path lands
     here as a transcript later; for now plain text only. */
  note                     text,
  status                   text not null default 'open'
    check (status in ('open','in_discussion','quoted','accepted','declined','withdrawn')),
  /* Set by staff when the request resolves. quote_id points at the
     deliverable surfaced in Needs approval. */
  resolution_note          text,
  resolved_at              timestamptz,
  resolved_by              uuid references auth.users(id),
  quote_id                 uuid
);

create index if not exists add_spec_requests_open_idx
  on add_specialist_requests (client_id, status)
  where status in ('open','in_discussion','quoted');
create index if not exists add_spec_requests_specialist_idx
  on add_specialist_requests (proposed_specialist_id)
  where status in ('open','in_discussion','quoted');

alter table add_specialist_requests enable row level security;

drop policy if exists "admin all add-spec"     on add_specialist_requests;
drop policy if exists "client reads add-spec"  on add_specialist_requests;
drop policy if exists "client writes add-spec" on add_specialist_requests;

create policy "admin all add-spec"
  on add_specialist_requests for all
  using (is_admin()) with check (is_admin());

create policy "client reads add-spec"
  on add_specialist_requests for select
  using (client_id = current_client_id());

create policy "client writes add-spec"
  on add_specialist_requests for insert
  with check (client_id = current_client_id() and requested_by = auth.uid());

comment on table add_specialist_requests is
  'Client-initiated "add this person" requests. Same privacy model as swap_requests — the proposed specialist never sees the row.';
