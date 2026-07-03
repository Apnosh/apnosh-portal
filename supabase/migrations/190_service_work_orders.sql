-- Service work orders — the execution spine for purchased SERVICES (the sibling of
-- creator_work_orders, which does the same for content pieces).
--
-- When an owner ships a campaign, each non-content service line handled by the Apnosh team
-- (gbp-setup, local-seo, review-engine, ...) becomes a work order an operator claims, works
-- through a real step CHECKLIST, and delivers with proof. Before this, services minted nothing
-- and had no "done" (the 7-stage audit's #1 gap). The checklist is stored as jsonb (a bounded
-- ~6-10 steps per service, seeded from the service's authored playbook), so no second table and
-- no further schema churn as playbooks are added.
--
-- line_item_id is the anchoring campaign_line_items row (captured at mint; no FK cascade so a
-- post-ship plan edit that rewrites line rows cannot silently delete the work order — reconcile
-- handles orphans in a later phase). status is a guarded machine; delivered requires proof.

create table if not exists service_work_orders (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete cascade,
  client_id uuid not null,
  line_item_id uuid,                                          -- the purchased line (captured at mint)
  service_id text not null,                                   -- e.g. 'gbp-setup'
  title text not null,                                        -- short internal label
  status text not null default 'queued'
    check (status in ('queued','claimed','in_progress','blocked_client','blocked_gate','ready_for_client','delivered')),
  assignee_id uuid,                                           -- staff person doing it (profiles.id), nullable
  due_date date,                                              -- ship + turnaround window (+ gate slack)
  gate_kind text,                                             -- external dependency, e.g. 'gbp-verify'
  gate_started_at timestamptz,                                -- when we started waiting on the gate (pauses SLA)
  blocked_reason text,                                        -- plain note when blocked_client/blocked_gate
  steps jsonb not null default '[]'::jsonb,                   -- the playbook instance (see service-playbooks.ts)
  proof_url text,                                             -- the deliverable link (live profile, report, ...)
  proof_note text,                                            -- the before/after summary handed to the client
  started_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One order per (campaign, line) so a re-mint is idempotent.
create unique index if not exists service_work_orders_campaign_line
  on service_work_orders (campaign_id, line_item_id);
create index if not exists service_work_orders_assignee on service_work_orders (assignee_id, status);
create index if not exists service_work_orders_status on service_work_orders (status);
create index if not exists service_work_orders_campaign on service_work_orders (campaign_id);

alter table service_work_orders enable row level security;

-- Admin (and the server's service role) manage everything; a staff member can read the orders
-- assigned to them. Owner-side reads go through the server (service role), so no owner policy.
do $$ begin
  create policy service_work_orders_admin on service_work_orders
    for all using (is_admin()) with check (is_admin());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy service_work_orders_assignee_read on service_work_orders
    for select using (assignee_id = auth.uid());
exception when duplicate_object then null; end $$;
