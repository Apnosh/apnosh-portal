-- The executable creator brief + the owner's creative-control mode.
--
-- creative_control (on the campaign) = how hands-on the owner is with the idea:
--   handoff        — AI writes the brief, creator runs with it, owner approves the final piece
--   approve_concept— AI writes it, owner okays the concept before the creator produces
--   owner_directs  — owner writes/edits the brief themselves
--
-- brief_details (on the order) caches the expensive part — the AI/owner creative
-- direction (concept, hook, shot list, caption). The deterministic sections
-- (specs, schedule, offer, deliverables, brand context) are recomputed each load.
--
-- concept_status gates production in approve_concept mode: 'pending' until the
-- owner okays the concept; 'approved' (default) lets the creator produce freely.

alter table campaigns
  add column if not exists creative_control text not null default 'handoff'
    check (creative_control in ('handoff', 'approve_concept', 'owner_directs'));

alter table creator_work_orders
  add column if not exists brief_details jsonb,
  add column if not exists concept_status text not null default 'approved'
    check (concept_status in ('approved', 'pending', 'changes'));
