# Architecture Decisions for Tier 2

**Date:** 2026-05-08
**Author:** Phase 3 of the Tier 2 Roadmap audit (read-only)
**Inputs:** Phase 1 inventory + Phase 2 gap analysis (both confirmed)
**Audience:** Mark + engineering

---

## Frame

Five architecture decisions block or amplify everything in the 2026 roadmap. This document picks a side on each, with the reasoning, the migration path, and the cost of getting it wrong.

Each decision follows the same shape:
- **Problem** — what hurts today
- **Options** — the realistic forks
- **Recommendation** — the call, with a confidence level
- **Migration path** — how we get there without stopping feature work
- **Cost of doing nothing** — what breaks in 2026 if we punt

---

## Decision 1: Tenancy model

### Problem

Two parallel tenant models. `businesses` (owner_id-scoped, predates Tier 2) and `clients` (admin-managed, current). Bridged by `businesses.client_id`. Every new feature has to decide which model to anchor on, and most existing pages query both. Every join is wider than it needs to be. RLS helpers (`current_client_id`, `current_user_client_id`) hide the duplication but don't fix it.

This is the single biggest source of accidental complexity in the codebase.

### Options

**A. Consolidate on `clients`. Deprecate `businesses` as a queryable entity.**
Keep `businesses` as a read-only legacy view; route all new code through `clients`. Migrate the few self-serve users (Tier 1, owner_id path) onto `clients` rows with synthetic `client_users` entries.

**B. Consolidate on `businesses`. Treat `clients` as a sibling profile.**
Reverse direction. Tier 2 admin features still work but `business_id` becomes the canonical foreign key.

**C. Status quo + a "tenant" abstraction layer in code.**
Don't touch the schema. Build a TypeScript `getTenantContext()` helper that papers over both models.

### Recommendation: **A — consolidate on `clients`. Confidence: high.**

Reasons:
- Tier 2 ($349–$799) is the business; `clients` is the model built for it. Tier 1 is small and shrinking as a share of revenue.
- All net-new schema (deliverables, scheduled_posts, ai_generations, channel_connections) already keys on `client_id`. The legacy gravity is on the `clients` side.
- Option C delays the pain without resolving it; the duplication keeps multiplying with every new table.
- The number of Tier 1 owners on `businesses.owner_id` is small enough to migrate in one batch.

### Migration path

**Q1 wk 1–2 (parallel to feature work):**
1. Audit which tables key on `business_id` only vs `client_id` only vs both. Output: a one-page table.
2. Pick a freeze date — after this date no new code writes `business_id`-only rows. CI lint rule: any new migration with `business_id NOT NULL` requires a comment override.

**Q1 wk 3–6:**
3. Backfill `business_id`-only tables with `client_id` (use the existing `businesses.client_id` bridge). Add `client_id NOT NULL` columns.
4. Migrate Tier 1 self-serve users: for every `businesses` row without a `clients` row, create one + a `client_users` mapping for the owner.
5. Update RLS policies to use `current_client_id()` only. Drop `current_user_client_id()` from new policies.

**Q2 onward:**
6. Mark `business_id` columns as deprecated. New queries hit `client_id`.
7. Schedule `business_id` removal for Q4 (after Tier 2 features are dependent only on `client_id`).

### Cost of doing nothing

Every Q3+ feature (POS, audience export) doubles its schema design time. Strategist console (Q1 1.3) cannot be a single SQL query — has to dual-walk both trees. Compounding interest on every line of new code.

---

## Decision 2: Unified action log

### Problem

Three overlapping event/audit tables:
- `client_interactions` — primary, growing
- `client_activity_log` — older, partly redundant, still written by some paths
- Per-feature audit tables (will multiply in Q1 1.4 with `scheduled_posts_history`)

The strategist console (1.3) needs "what changed across this client in the last 24 hours" — currently 4 unioned queries.

### Options

**A. One big `events` table, polymorphic.**
`(id, client_id, actor_id, actor_type, event_type, subject_type, subject_id, payload jsonb, created_at)`. Everything writes here. Per-feature tables become read indexes/materialized views.

**B. Keep per-feature tables, build a SQL view that unions them.**
`v_client_events` view that pulls from interactions + scheduled_posts_history + deliverables_history etc.

**C. Status quo, just deprecate `client_activity_log`.**
Smallest change. Doesn't help the console.

### Recommendation: **A — unified `events` table. Confidence: medium-high.**

Reasons:
- The strategist console needs a single feed; option B works but query cost grows linearly with feature count.
- Option A makes the AI-summary path trivial: "summarize the last 50 events for client X" is one query.
- Polymorphic JSONB is exactly the right shape — events are semi-structured by nature.
- Postgres handles this well at our scale (100s of clients × 100s of events/client/month = ~100k–1M rows/yr; comfortable on Supabase).

The medium qualifier: the rare downside is that `payload jsonb` is harder to constrain than typed columns. Mitigate with a Zod schema per `event_type` validated in the writer helper.

### Migration path

**Q1 wk 4:**
1. Create `events` table.
2. Build `logEvent({ clientId, actorId, eventType, subjectType, subjectId, payload })` helper. All new code writes here.
3. Backfill: `client_interactions` → `events` one-shot copy.
4. Deprecate `client_activity_log`. Plan removal for Q2 wk 4 after dependent reports are migrated.

**Q1 wk 5+:**
5. Strategist console (1.3) reads from `events`.
6. New audit needs (1.4 state changes, 2.1 ad campaign changes) write to `events` not new per-feature tables.

### Cost of doing nothing

Strategist console becomes a 4-way union with ad-hoc `ORDER BY created_at`, slow at 50+ clients per strategist. AI summarization across "what happened" requires custom prompt-construction per source.

---

## Decision 3: Integration abstraction layer

### Problem

Today: every OAuth integration (Meta, GMB, TikTok, LinkedIn, Stripe) has its own `/api/integrations/<provider>/*` routes, its own token-refresh logic, its own error-handling. When Meta's API changes, we change 6 files.

Q2/Q3 add 4–6 more integrations: Klaviyo, Twilio, BrightLocal, Toast, possibly DataForSEO and Yext.

Without an abstraction, the integration code becomes 60% of the codebase by Q4.

### Options

**A. Per-integration "connector" interface + registry.**
Define a `Connector` interface (`auth`, `refresh`, `sync`, `disconnect`, `testConnection`). Each integration implements it. A registry maps `provider → connector`. Crons walk the registry.

**B. Adopt an off-the-shelf integration framework (Nango, Pipedream, etc.).**
Outsource the OAuth-and-refresh layer. We just write business logic.

**C. Status quo — keep adding bespoke routes.**

### Recommendation: **A — internal connector interface. Confidence: high.**

Reasons:
- Off-the-shelf (B) sounds great until you hit a custom field or rate-limit behavior. Our integrations are restaurant-specific in their data shape (POS line items, GMB review fields). The vendor abstractions hide the wrong things.
- Restaurant-tech vendors (Toast, Klaviyo) have idiosyncrasies that benefit from a thin internal layer rather than a thick external one.
- Per-feature OAuth state, refresh windows, scope reauth flows — better in our control.
- Cost of A is one engineer-week up front + minor cost per new integration. Cost of C compounds forever.

### Migration path

**Q1 wk 2:**
1. Define `Connector` interface in `src/lib/integrations/types.ts`.
2. Refactor Meta integration as the reference implementation.
3. Build shared token-refresh cron that walks the registry (replaces 4 separate refresh routes).
4. Surface `sync_error` consistently in `channel_connections`.

**Q1 wk 3+:**
5. Migrate GMB, TikTok, LinkedIn one at a time. Time-boxed: 1 day each.
6. New integrations (Klaviyo Q2, Toast Q3) use the interface from day 1.

### Cost of doing nothing

By Q4, Toast + Klaviyo + Twilio + Meta Ads + BrightLocal each duplicate the same OAuth/refresh/error pattern. Token-refresh failures will hit different clients silently. Onboarding a new engineer to "the Meta integration" means learning a different code shape than "the Klaviyo integration."

---

## Decision 4: Permissions model

### Problem

Today: binary admin/non-admin (`profiles.role`). One `is_admin()` helper. Strategists either see everything or nothing.

Tier 2 needs:
- Strategist Alice can edit Client X but not Client Y (assignment-based).
- Strategist Bob can read all clients but only write to his.
- Junior strategists can draft but not publish.
- Mark (founder) sees everything always.
- Per-client *integration* writes (e.g., "Bob can run paid social for Acme") need finer scope than just "assigned."

### Options

**A. Role + assignments + capability flags.**
- `roles`: founder, senior_strategist, strategist, junior_strategist, viewer.
- `client_assignments(strategist_id, client_id)`.
- `capabilities(role, capability)` — e.g., `(strategist, scheduled_posts.publish)`.
- RLS helpers compose: `can(user, capability, client_id)`.

**B. Pure RBAC at the role level (no per-client assignment).**
Simpler, but blocks 1.3 strategist console "my clients only" filter.

**C. Pure ABAC (attribute-based, all rules in code).**
Most flexible, hardest to reason about, hardest to put in RLS.

### Recommendation: **A — RBAC + assignments + capabilities. Confidence: high.**

Reasons:
- Maps cleanly to how the team actually works (assigned strategist + a few capabilities like "can publish without review").
- Implementable in Postgres RLS (the helpers compose).
- Auditable — `can(user, "ads.spend", client)` is a function you can unit-test.

### Migration path

**Q2 wk 1–3:**
1. Add `roles` enum, migrate `profiles.role` values.
2. Add `client_assignments` table (assigned strategist column may already exist on `clients` — promote to its own table for many-to-many).
3. Add `capabilities` table seeded with role defaults.
4. Replace `is_admin()` calls with `can(...)` over Q2.

### Cost of doing nothing

Strategist console (1.3) ships with "see all" or "see your one" but no in-between. Every Q2+ write path needs a custom permission check.

---

## Decision 5: Content pipeline state machine

### Problem

`scheduled_posts.status` is a string column with no enforced transitions. Q1 1.4 calls for a real state machine. The same shape will recur for: campaigns (2.1), email/SMS sends (2.2), audience syncs (3.2), generated reports (4.1).

### Options

**A. Generic state-machine pattern.**
Pick one library/pattern (e.g., a `state_transitions(entity_type, from, to, allowed)` table + a DB trigger). Reuse for every workflowed entity.

**B. Per-entity hand-rolled state checks.**
Postgres CHECK constraints on each table.

**C. App-layer enforcement only.**
TypeScript guards, no DB enforcement. Fastest to ship, easiest to bypass.

### Recommendation: **A — generic, DB-enforced. Confidence: medium-high.**

Reasons:
- We're going to have 5+ workflowed entities in 12 months. One pattern that works for all is cheaper than 5 bespoke ones.
- DB enforcement matters for Tier 2 auditability — strategists make mistakes; clients pay $799 expecting they don't reach the world.
- Trigger-based approach is well-understood Postgres territory.

The medium qualifier: state-machine libraries in the JS ecosystem (xstate) are tempting but live in app code. Putting enforcement in Postgres protects against direct-SQL mistakes (admin scripts, future MCP write paths).

### Migration path

**Q1 wk 1–2 (foundation for 1.4):**
1. Define `state_transitions(entity_type, from_state, to_state, requires_capability)`.
2. Generic trigger `enforce_state_transition()` applied per entity-table.
3. App-layer helper `transition(entity, to, actor)` that logs to `events` (Decision 2) and returns the new row.
4. First user: `scheduled_posts`. Subsequent entities adopt as built.

### Cost of doing nothing

1.4 is half-built. Each later workflow reinvents the same wheel. A bug in any one of 5 hand-rolled state machines = a bug a paying client sees.

---

## Decisions at a glance

| # | Decision | Recommendation | Confidence | When |
|---|---|---|---|---|
| 1 | Tenancy | Consolidate on `clients` | High | Q1 wk 1–6 |
| 2 | Action log | Unified `events` table | Med-high | Q1 wk 4 |
| 3 | Integrations | Internal `Connector` interface | High | Q1 wk 2 |
| 4 | Permissions | RBAC + assignments + capabilities | High | Q2 wk 1–3 |
| 5 | State machine | Generic, DB-enforced | Med-high | Q1 wk 1–2 |

Four of the five decisions land in Q1. That's intentional — Q2/Q3/Q4 features are 2–4× more expensive without these foundations.

---

## What this does NOT cover

Out of scope here, called out so they don't get lost:

1. **PII encryption-at-rest** — separate security review before Q3 POS work. Recommend Q2 wk 6 with an outside set of eyes.
2. **Multi-region / latency** — not a 2026 problem at our scale. Defer.
3. **Offline / mobile app** — explicitly not on the roadmap. Defer.
4. **Webhook ingress** (Stripe is wired; will need Klaviyo + Toast webhooks in Q2/Q3) — straightforward extension once Decision 3 lands.
5. **Observability** — error tracking + structured logging audit. Deserves its own pass, suggest Q1 wk 12 (during buffer week).

---

## Sequencing implication for Q1

If all five Q1 architecture moves land as proposed, the Q1 feature sequence from Phase 2 needs one tweak:

**Original Phase 2 sequence:** 1.4 → 1.2 → 1.3 → 1.1
**Adjusted sequence:** *(architecture wks 1–4 in parallel)* 1.4 → 1.2 → 1.3 → 1.1

The 1.4 work *is* the first user of Decisions 2 + 5. So weeks 1–2 are the foundation, and 1.4 reads as both "feature" and "first proof of architecture." This compresses time-to-value.

Phase 4 (the week-by-week Q1 plan) will lay this out concretely.

---

## Confirmation needed before Phase 4

Phase 4 is the week-by-week Q1 plan — it commits to dates. Before I write it, confirm:

1. **Decision 1 (tenancy)** — comfortable picking `clients` as canonical and starting backfill in Q1 wk 1, or do you want to delay tenancy work to Q2 to keep Q1 focused on shipping features?
2. **Decision 2 (events table)** — accept the polymorphic JSONB approach, or prefer per-feature audit tables despite the duplication?
3. **Decision 4 (permissions)** — Q2 timing for the RBAC overhaul okay, or do you want to start it earlier so 1.3 strategist console can use it day 1 (would push 1.3 later)?
4. **Decision 5 (state machine)** — DB-enforced via triggers, or app-layer-only acceptable to ship faster?

Reply with confirmations/corrections and I'll write Phase 4 (the Q1 execution plan).
