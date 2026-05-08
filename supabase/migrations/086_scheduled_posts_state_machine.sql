-- 086_scheduled_posts_state_machine.sql
--
-- Q1 wk 3 (1.4) -- formalize scheduled_posts workflow.
--
-- Expands the status enum to include 'in_review', 'approved', and
-- 'canceled', adds a per-post audit history, seeds the state_transitions
-- table for entity_type='scheduled_post', and wires the generic
-- enforce_state_transition() trigger from migration 084.
--
-- Approval flow:
--   draft -> in_review -> approved -> scheduled -> publishing -> published
--                                                              |-> partially_failed
--                                                              |-> failed
--   any non-terminal -> canceled
--
-- Backwards compatible: existing 'draft' / 'scheduled' / 'publishing' /
-- 'published' / 'partially_failed' / 'failed' rows keep their values; the
-- new states ('in_review', 'approved', 'canceled') become available
-- moving forward.

-- 1) Drop the old CHECK and replace with the expanded set.
alter table scheduled_posts drop constraint if exists scheduled_posts_status_check;

alter table scheduled_posts
  add constraint scheduled_posts_status_check
  check (status in (
    'draft',
    'in_review',
    'approved',
    'scheduled',
    'publishing',
    'published',
    'partially_failed',
    'failed',
    'canceled'
  ));

-- 2) Per-post audit history. Append-only.
create table if not exists scheduled_posts_history (
  id uuid primary key default gen_random_uuid(),
  scheduled_post_id uuid not null references scheduled_posts(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  from_state text,
  to_state text not null,
  actor_id uuid references auth.users(id) on delete set null,
  actor_role text,                              -- 'admin' | 'client' | 'system' | 'cron'
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists scheduled_posts_history_post_idx
  on scheduled_posts_history(scheduled_post_id, created_at desc);
create index if not exists scheduled_posts_history_client_idx
  on scheduled_posts_history(client_id, created_at desc);

alter table scheduled_posts_history enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public'
      and tablename='scheduled_posts_history'
      and policyname='Admins read scheduled_posts_history'
  ) then
    create policy "Admins read scheduled_posts_history"
      on scheduled_posts_history for select using (is_admin());
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public'
      and tablename='scheduled_posts_history'
      and policyname='Client reads own history'
  ) then
    create policy "Client reads own history"
      on scheduled_posts_history for select using (client_id = current_client_id());
  end if;
end $$;

-- 3) Seed state_transitions for scheduled_post.
insert into state_transitions(entity_type, from_state, to_state, description) values
  ('scheduled_post', null,                'draft',            'New draft created'),
  ('scheduled_post', 'draft',             'in_review',        'Submitted for client/AM review'),
  ('scheduled_post', 'in_review',         'draft',            'Reviewer requested changes'),
  ('scheduled_post', 'in_review',         'approved',         'Approved by client/AM'),
  ('scheduled_post', 'draft',             'approved',         'Auto-approved (trust-mode clients)'),
  ('scheduled_post', 'approved',          'scheduled',        'Queued for publisher'),
  ('scheduled_post', 'draft',             'scheduled',        'Direct schedule (legacy path, kept for back-compat)'),
  ('scheduled_post', 'scheduled',         'publishing',       'Publisher picked up the post'),
  ('scheduled_post', 'publishing',        'published',        'All platforms succeeded'),
  ('scheduled_post', 'publishing',        'partially_failed', 'Some platforms failed'),
  ('scheduled_post', 'publishing',        'failed',           'All platforms failed'),
  ('scheduled_post', 'partially_failed',  'publishing',       'Retry partial failure'),
  ('scheduled_post', 'failed',            'scheduled',        'Manual retry'),
  ('scheduled_post', 'scheduled',         'failed',           'Pre-publish error (auth, validation)'),
  ('scheduled_post', 'draft',             'canceled',         'Canceled before review'),
  ('scheduled_post', 'in_review',         'canceled',         'Canceled during review'),
  ('scheduled_post', 'approved',          'canceled',         'Canceled after approval'),
  ('scheduled_post', 'scheduled',         'canceled',         'Canceled after queueing')
on conflict do nothing;

-- 4) Wire the generic enforcement trigger to scheduled_posts.
drop trigger if exists scheduled_posts_state_guard on scheduled_posts;
create trigger scheduled_posts_state_guard
  before insert or update of status on scheduled_posts
  for each row
  execute function enforce_state_transition('scheduled_post', 'status');

-- 5) Audit row writer. Fires AFTER the guard succeeds.
create or replace function log_scheduled_post_transition()
returns trigger
language plpgsql
as $$
declare
  v_from text;
begin
  if tg_op = 'INSERT' then
    v_from := null;
  else
    v_from := old.status;
    if old.status is not distinct from new.status then
      return new;
    end if;
  end if;

  insert into scheduled_posts_history(
    scheduled_post_id, client_id, from_state, to_state
  ) values (
    new.id, new.client_id, v_from, new.status
  );
  return new;
end;
$$;

drop trigger if exists scheduled_posts_log_transition on scheduled_posts;
create trigger scheduled_posts_log_transition
  after insert or update of status on scheduled_posts
  for each row
  execute function log_scheduled_post_transition();

-- 6) client_services.requires_client_approval -- per-client gate on
-- whether posts must move through in_review before publishing.
-- Guarded so this migration applies cleanly even before the
-- client_services table is introduced (see migration 089).
do $$ begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'client_services'
  ) then
    execute $sql$
      alter table client_services
        add column if not exists requires_client_approval boolean not null default true
    $sql$;
    execute $sql$
      comment on column client_services.requires_client_approval is
        'When true, scheduled_posts under this service must transition through '
        '''in_review'' -> ''approved'' before scheduling. When false, the strategist '
        'can move directly draft -> approved -> scheduled (trust mode).'
    $sql$;
  end if;
end $$;
