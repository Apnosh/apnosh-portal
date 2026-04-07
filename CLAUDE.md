# Apnosh Client Portal

## What This Is
A dual-portal SaaS application for Apnosh, an AI-powered digital marketing agency. Two audiences: **clients** (local business owners managing their marketing) and **admins** (the Apnosh team delivering and managing services).

## Tech Stack
- **Framework:** Next.js 16 (App Router, React 19, TypeScript)
- **Database:** Supabase (Postgres + Auth + RLS + Storage)
- **Styling:** Tailwind CSS v4
- **Payments:** Stripe (subscriptions + one-time invoices)
- **Icons:** lucide-react
- **Utilities:** clsx, tailwind-merge

## Project Structure
```
src/
├── app/
│   ├── (auth)/          # Login, signup, onboarding (public routes)
│   ├── admin/           # Admin portal (role-gated)
│   │   ├── clients/     # Client list + detail views
│   │   ├── orders/      # Order management
│   │   ├── pipeline/    # Content production kanban
│   │   ├── reports/     # Reporting tools
│   │   └── team/        # Internal team management
│   ├── dashboard/       # Client portal (auth-gated)
│   │   ├── analytics/   # Performance dashboards
│   │   ├── approvals/   # Content approval workflow
│   │   ├── billing/     # Subscriptions, invoices, payment methods
│   │   ├── calendar/    # Content calendar
│   │   ├── messages/    # Support messaging
│   │   ├── orders/      # Service ordering + checkout
│   │   ├── profile/     # Business profile management
│   │   ├── settings/    # Preferences (approval mode, notifications)
│   │   └── tools/       # AI marketing tools
│   ├── api/webhooks/    # Stripe webhook handler
│   └── auth/callback/   # Supabase OAuth callback
├── components/ui/       # Shared UI components
├── lib/
│   ├── supabase/        # Client, server, hooks, middleware helpers
│   ├── cart-context.tsx  # Shopping cart for service ordering
│   ├── services-data.ts # Service catalog definitions
│   ├── actions.ts       # Server actions
│   └── stripe.ts        # Stripe client config
├── types/
│   └── database.ts      # All TypeScript types for DB entities
└── middleware.ts         # Auth middleware
```

## Database Schema
Full schema in `supabase/migrations/001_core_schema.sql`. Key tables:
- `profiles` — extends Supabase auth.users (roles: client, admin, team_member)
- `businesses` — client organizations with brand kit, audience, goals
- `service_catalog` — available services with Stripe product/price IDs
- `subscriptions` — active service subscriptions per business
- `orders` — one-time and à la carte purchases
- `deliverables` — content pieces with approval workflow statuses
- `content_calendar` — scheduled posts across platforms
- `analytics_snapshots` — imported performance data per platform
- `messages` / `message_threads` — client-admin communication
- `notifications` — in-app notification system

**RLS is enforced on every table.** Clients can only access rows matching their business_id. Admins bypass via `is_admin()` helper function.

## Design System

### Fonts
- **Display/Headings:** `var(--font-display)` — Playfair Display
- **Body:** System/Inter stack

### Colors (CSS variables)
- `--brand` / `--brand-dark` — Apnosh green (#4abd98 / #2e9a78)
- `--brand-tint` — Light green background
- `--ink` through `--ink-6` — Gray scale (dark to light)
- `--bg-2` — Subtle background

### Patterns
- Cards: `bg-white rounded-xl border border-ink-6 p-4`
- Section headers: `font-[family-name:var(--font-display)] text-base text-ink`
- Small labels: `text-[10px] text-ink-4 uppercase tracking-wider font-medium`
- Status badges: Colored pill with `text-[11px] font-medium px-2 py-0.5 rounded-full border`
- Stat cards: Icon + large number + label + change indicator

### Component Conventions
- All pages are client components (`'use client'`) when they need interactivity
- Sidebar nav with active state highlighting via `usePathname()`
- Mobile-responsive with `lg:` breakpoint for sidebar collapse
- Consistent spacing: `space-y-5` or `space-y-6` for page sections, `gap-3` or `gap-4` for grids

## Roles & Access
| Role | Portal | Access |
|------|--------|--------|
| `admin` | `/admin/*` | All clients, all data, content management, billing admin |
| `client` | `/dashboard/*` | Own business only, ordering, approvals, profile, billing |
| `team_member` | `/dashboard/*` | Own business, limited actions (future: configurable permissions) |

## Current State
Most pages have **complete UI with mock/hardcoded data**. The migration path is:
1. Replace mock data with Supabase queries
2. Add server actions for mutations
3. Wire up Stripe for real payment flows
4. Connect the approval workflow end-to-end
5. Build the analytics import pipeline (admin side)

## Key Business Logic

### Content Approval Workflow
States: `draft` → `internal_review` → `client_review` → `approved` → `scheduled` → `published`
- Clients can set **auto-approve** globally or per content type (social, blog, ads)
- **Revision limits** are tied to the service tier (Basic: 1, Standard: 2, Pro: 3)
- Each deliverable tracks `revision_count` against its `revision_limit`
- Additional revisions purchasable as add-ons once limit is reached

### Brand & Style Guidelines
- Every client gets a living brand guidelines document — auto-generated from profile data or parsed from an uploaded PDF
- Editable in-portal (section-by-section) with PDF export on demand
- AI (Claude API) enriches raw profile data into professional copy (voice descriptions, positioning statements, sample CTAs)
- Uploaded PDFs are parsed via Claude API → extracted data shown for client review/confirmation before saving
- Guidelines and business profile are two-way synced — edits to one update the other
- Revision/extension requests go through the normal order + approval pipeline
- Stored in `brand_guidelines` table with versioning (current/draft/archived)

### Founding Client Rate
- 15% loyalty discount for early clients
- Tied to continuous enrollment — if they cancel, they lose the rate
- Applied automatically in billing calculations

### Content Production Engine (Admin-side)
- 8-phase pipeline: Intelligence → Strategy → Ideation → Briefing → Creation → QA → Approval → Analysis
- AI handles invisible infrastructure (research, briefs, QA checks, analytics). Humans handle creative decisions.
- Client intelligence briefs generated weekly per client (trending content, competitor activity, performance data)
- Content pillars per client (4-6 loose thematic categories, not rigid)
- AI ideation generates concept pools → human curates and selects → AI expands into full briefs
- Structured briefs auto-generated per content type (reel, carousel, blog, email, static, story, GBP)
- 4 reel production tiers: Storytelling (cinematic, 60min shoot), Showcase (cinematic, 45min), Promo (advertisement, 30min), General Ad (basic, 30min)
- 3 carousel tiers: Premium, Standard, Basic
- Shoot plans auto-generated from content calendar — shot lists tied to specific planned posts
- Automated QA checklist (brand voice, technical specs, strategic alignment) before human review
- Content atomization: anchor pieces (blogs, shoots) broken into derivative content across platforms
- Performance tracking feeds back into intelligence briefs (flywheel)
- New tables: client_intelligence, content_pillars, content_concepts, content_briefs, shoot_plans, content_performance, content_templates

### Service Ordering
- Cart-based checkout flow already exists
- Subscriptions go through Stripe Checkout
- One-time orders use Stripe Payment Intents
- Orders auto-generate work briefs for the admin pipeline

## Rules
- **Never hardcode business data** — always scope queries by business_id from the authenticated user's profile
- **Use Supabase RLS** — don't duplicate access control in application code; trust the policies
- **Keep pages under 500 lines** — extract components when a page grows beyond this
- **Match existing patterns** — look at how similar pages are built before creating new ones
- **Mobile-first responsive** — all client-facing pages must work on phone screens
- **Industry-agnostic** — no restaurant-specific fields or copy; industry is a tag, not a schema
- **Plain English copy** — no jargon, no "leverage your synergies"; write like a human
