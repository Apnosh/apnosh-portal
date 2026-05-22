-- Collaborative planning layer.
--
-- Extends the owner-only planner (owner_plans, migration 153) into a
-- multi-party system so a plan can be shared across accounts: a
-- photoshoot shows up for the photographer and the restaurant owner,
-- deadlines show for everyone involved, and notes can stay private or
-- be sent to a strategist.
--
-- New:
--   owner_plans.visibility - 'private' (creator only) | 'team' (the
--                            restaurant's people). Participants always
--                            see the item regardless of this flag.
--   plan_participants       - the people on a plan (owner, strategist,
--                            photographer, vendor...), with accept /
--                            decline. This is what makes an item appear
--                            on another account's calendar.
--   plan_notes              - per-item notes, each private to the author,
--                            shared with the people on the plan, or sent
--                            to the client's strategist.
--
-- Existing agency work (shoots, deliverables, content production,
-- scheduled posts) is NOT duplicated here; the planner's read layer
-- merges those in per viewer.

-- ── owner_plans.visibility ──
alter table owner_plans
  add column if not exists visibility text not null default 'team'
    check (visibility in ('private', 'team'));

-- ── participants ──
create table if not exists plan_participants (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references owner_plans(id) on delete cascade,
  person_id uuid not null references auth.users(id) on delete cascade,
  -- Free text so it can hold any role_capability value plus 'owner'/'vendor'.
  role text,
  status text not null default 'accepted'
    check (status in ('invited', 'accepted', 'declined')),
  invited_by uuid references auth.users(id) on delete set null,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (plan_id, person_id)
);
create index if not exists plan_participants_plan_idx on plan_participants (plan_id);
create index if not exists plan_participants_person_idx
  on plan_participants (person_id) where status <> 'declined';

-- ── notes ──
create table if not exists plan_notes (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references owner_plans(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  visibility text not null default 'private'
    check (visibility in ('private', 'shared', 'strategist')),
  created_at timestamptz not null default now()
);
create index if not exists plan_notes_plan_idx on plan_notes (plan_id, created_at);

-- ════════════════════════════ RLS ════════════════════════════
-- Note: the app reads and writes through the service-role client in
-- server actions (which enforce auth explicitly), so these policies are
-- defense-in-depth for any direct authenticated-client access. They are
-- written one-directional (owner_plans may reference plan_participants,
-- but plan_participants never references owner_plans) to avoid recursive
-- policy evaluation.

alter table plan_participants enable row level security;
alter table plan_notes enable row level security;

-- ── owner_plans: replace the single-party policy from 153 ──
drop policy if exists "client manages own plans" on owner_plans;
drop policy if exists "admin all plans" on owner_plans;
drop policy if exists "plans select" on owner_plans;
drop policy if exists "plans insert" on owner_plans;
drop policy if exists "plans update" on owner_plans;
drop policy if exists "plans delete" on owner_plans;

create policy "plans select" on owner_plans for select using (
  created_by = auth.uid()
  or is_admin()
  or exists (
    select 1 from plan_participants pp
    where pp.plan_id = owner_plans.id and pp.person_id = auth.uid() and pp.status <> 'declined'
  )
  or (visibility = 'team' and (
    client_id in (select b.client_id from businesses b where b.owner_id = auth.uid())
    or client_id in (select cu.client_id from client_users cu where cu.auth_user_id = auth.uid())
    or client_id in (select ra.client_id from role_assignments ra
                     where ra.person_id = auth.uid() and ra.ended_at is null and ra.client_id is not null)
  ))
);

-- Writes (creator, the restaurant team, assigned agency staff, admins).
-- Kept as separate per-command policies so they never widen SELECT.
create policy "plans insert" on owner_plans for insert with check (
  created_by = auth.uid()
  or is_admin()
  or client_id in (select b.client_id from businesses b where b.owner_id = auth.uid())
  or client_id in (select cu.client_id from client_users cu where cu.auth_user_id = auth.uid())
  or client_id in (select ra.client_id from role_assignments ra
                   where ra.person_id = auth.uid() and ra.ended_at is null and ra.client_id is not null)
);
create policy "plans update" on owner_plans for update using (
  created_by = auth.uid()
  or is_admin()
  or client_id in (select b.client_id from businesses b where b.owner_id = auth.uid())
  or client_id in (select cu.client_id from client_users cu where cu.auth_user_id = auth.uid())
  or client_id in (select ra.client_id from role_assignments ra
                   where ra.person_id = auth.uid() and ra.ended_at is null and ra.client_id is not null)
) with check (
  created_by = auth.uid()
  or is_admin()
  or client_id in (select b.client_id from businesses b where b.owner_id = auth.uid())
  or client_id in (select cu.client_id from client_users cu where cu.auth_user_id = auth.uid())
  or client_id in (select ra.client_id from role_assignments ra
                   where ra.person_id = auth.uid() and ra.ended_at is null and ra.client_id is not null)
);
create policy "plans delete" on owner_plans for delete using (
  created_by = auth.uid()
  or is_admin()
  or client_id in (select b.client_id from businesses b where b.owner_id = auth.uid())
  or client_id in (select cu.client_id from client_users cu where cu.auth_user_id = auth.uid())
  or client_id in (select ra.client_id from role_assignments ra
                   where ra.person_id = auth.uid() and ra.ended_at is null and ra.client_id is not null)
);

-- ── plan_participants (self-contained; never references owner_plans) ──
drop policy if exists "participants select" on plan_participants;
drop policy if exists "participants insert" on plan_participants;
drop policy if exists "participants update" on plan_participants;
drop policy if exists "participants delete" on plan_participants;

create policy "participants select" on plan_participants for select using (
  person_id = auth.uid() or invited_by = auth.uid() or is_admin()
);
create policy "participants insert" on plan_participants for insert with check (
  invited_by = auth.uid() or is_admin()
);
-- A person may update their own row (accept / decline); the inviter and
-- admins manage the rest.
create policy "participants update" on plan_participants for update using (
  person_id = auth.uid() or invited_by = auth.uid() or is_admin()
) with check (
  person_id = auth.uid() or invited_by = auth.uid() or is_admin()
);
create policy "participants delete" on plan_participants for delete using (
  invited_by = auth.uid() or is_admin()
);

-- ── plan_notes ──
drop policy if exists "notes select" on plan_notes;
drop policy if exists "notes insert" on plan_notes;
drop policy if exists "notes update" on plan_notes;
drop policy if exists "notes delete" on plan_notes;

create policy "notes select" on plan_notes for select using (
  author_id = auth.uid()
  or is_admin()
  or (visibility = 'shared' and exists (
    select 1 from owner_plans op
    where op.id = plan_notes.plan_id and (
      op.created_by = auth.uid()
      or exists (select 1 from plan_participants pp
                 where pp.plan_id = op.id and pp.person_id = auth.uid() and pp.status <> 'declined')
      or (op.visibility = 'team' and (
        op.client_id in (select b.client_id from businesses b where b.owner_id = auth.uid())
        or op.client_id in (select cu.client_id from client_users cu where cu.auth_user_id = auth.uid())
        or op.client_id in (select ra.client_id from role_assignments ra
                            where ra.person_id = auth.uid() and ra.ended_at is null and ra.client_id is not null)
      ))
    )
  ))
  or (visibility = 'strategist' and exists (
    select 1 from owner_plans op
    join role_assignments ra on ra.client_id = op.client_id
    where op.id = plan_notes.plan_id
      and ra.person_id = auth.uid() and ra.ended_at is null
      and ra.role in ('strategist', 'admin')
  ))
);
create policy "notes insert" on plan_notes for insert with check (author_id = auth.uid() or is_admin());
create policy "notes update" on plan_notes for update using (author_id = auth.uid() or is_admin())
  with check (author_id = auth.uid() or is_admin());
create policy "notes delete" on plan_notes for delete using (author_id = auth.uid() or is_admin());

comment on table plan_participants is
  'People on an owner_plans item across accounts (photographer, strategist, vendor...). Drives cross-account calendar visibility.';
comment on table plan_notes is
  'Per-plan notes. visibility: private (author only), shared (people on the plan), strategist (sent to the client''s strategist).';
comment on column owner_plans.visibility is
  'private = creator only; team = the restaurant''s people. Participants see the item regardless.';
