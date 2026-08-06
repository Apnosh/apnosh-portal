# THE CHANNELS LAYER — plan of record

Owner decision 2026-08-06 (memory: project_integrations_strategy): owner-connected data
comes from four kinds of lane, never one grand integration:

- **Direct API** where self-serve and free: Google (done), Square, Clover, Yelp data.
- **Rented pipe** where the platform gates access: Ayrshare for social/Meta (their approved
  app; no App Review for us). Bake-off vs bundle.social before the key is bought.
- **Upload** where only statements exist: delivery apps, odd POS (Auto-Star precedent).
- **Guide** where no API exists: Yelp replies (AI draft + deep link + mark done).

Ads are NOT owner-connected: Apnosh runs them from its own Meta Business Manager with client
Pages granted as partner access (ops step in onboarding, not code).

## The laws

1. **Own the data model, rent the pipe.** Screens read canonical tables and NEVER a vendor
   SDK. Each vendor is ONE adapter file; swapping vendors is rewriting one fetcher.
2. **Every channel fails loud.** Every sync writes a `channel_sync_runs` row. Three
   consecutive failures mint an owner alert through the existing notification path. No
   silent staleness — the GA4 7-day OAuth outage and the AI credit outage are the scars.
3. **Secrets live in env, never in code.** Missing env = adapter reports `not_configured`
   and surfaces say so honestly (the placeholder-prices pattern).
4. **Idempotent syncs.** Upsert on natural keys; a retry can never double-write a metric.
5. **Prod migrations are handed to the owner as SQL** for the Supabase dashboard.

## Schema (migration 234 — EXTEND, do not reinvent)

DISCOVERY (2026-08-06 infra map): `channel_connections` ALREADY EXISTS (migration 043:
client_id, channel text, connection_type oauth|api_key|manual|csv_import|built_in, token
columns, status pending|active|error|disconnected, last_sync_at, sync_error, metadata jsonb)
and is ALREADY used by Yelp (`connectYelp` in src/lib/connection-actions.ts). The merged
reader `getConnectionsForClient()` and the inbox already treat broken connections as owner
alerts. The channels layer builds ON this registry.

Migration 234 adds only what is missing:
- `channel_sync_runs`: id, connection_id → channel_connections, started_at, finished_at,
  status ok|error, items_written int, error_text. The health ledger. RLS admin-only
  (233 house style).
- `pos_daily_sales`: id, client_id, source text (square|clover|statement:<app>), day date,
  gross_cents bigint, orders int, meta jsonb, UNIQUE(client_id, source, day) — the
  idempotency key. RLS: admin-all + client-read-own.
- `channel_connections.consecutive_failures int not null default 0` (alter).

Status vocabulary stays the EXISTING enum: 'error' is the needs-attention state;
'not_configured' is an adapter-level env state, never stored. Social metrics stay in
social_connections/social_metrics; Yelp excerpts land in local_reviews (source='yelp',
onConflict client_id,source,external_id — both already exist).

## Architecture

- `src/lib/channels/types.ts` — `ChannelAdapter` contract: id, kind
  (oauth|hosted_link|api_key|upload), isConfigured(), connectStart(clientId),
  sync(connection) → {itemsWritten} or typed ChannelError, disconnect.
- `src/lib/channels/registry.ts` — closed adapter map; golden asserts no gaps.
- `src/lib/channels/adapters/{yelp,square,clover,statements,ayrshare}.ts` — each is the
  ONLY file that knows its vendor's wire format. Yelp WRAPS the existing
  previewYelpBusiness machinery; Square/Clover authorize URLs are real in P1, token
  exchange lands P4; ayrshare stub until P3.
- `src/lib/channels/sync.ts` — the engine: walk active connections with configured
  adapters, try/catch per connection, write sync_runs, bump/reset consecutive_failures,
  alert exactly on the transition to 3 via notifyClientOwners. Pure decision helpers
  exported for sims.
- `/api/cron/sync-channels` — the house three-way cron guard (vercel-cron UA / ?secret /
  Bearer), verbatim from social-sync.
- Owner UI: existing connected-accounts + "Your channels" surfaces read the same registry;
  per-channel setup cards in the three-lane pattern (P2+).
- Admin cockpit: /admin/channels (P6).

## Phases and estimate

- **P1 — the spine (no external keys): 1 session.** Migration 234, types + registry +
  adapters + engine + cron + sims. Yelp adapter is REAL (env key already conventioned).
- **P2 — statement upload lane: 1 session.** Upload card, CSV parse, pos_daily_sales.
- **P3 — Ayrshare live (needs key after bake-off): 1-2 sessions.** Hosted link, metrics
  into social_metrics, publish bridge.
- **P4 — Square + Clover OAuth (keys in hand): 1-2 sessions.** Callback token exchange,
  daily-sales sync into pos_daily_sales + brain signals.
- **P5 — Yelp reply guide lane: 1 session.** Reuses reviewsreply machinery.
- **P6 — hardening + cockpit: 1 session.**

Total: 6-8 sessions. P1+P2 immediately.

## Owner items

1. Apply migration 234 SQL in Supabase dashboard (handed at end of P1).
2. Ayrshare/bundle.social key — after bake-off. 3. Square dev app — DONE 2026-08-06 (keys
in .env.local). 4. Clover dev app — in progress. 5. Yelp Fusion key — verify pricing;
env name YELP_API_KEY already conventioned. 6. Meta Business Manager + partner-access
onboarding step.

## Out of scope (decided)

Own Meta app (trigger: ~100+ profiles or paid capability gap) · Toast (until a paying
Toast client) · OpenTable/Resy · TripAdvisor API · scrapers (never) · Yext-style resellers.
