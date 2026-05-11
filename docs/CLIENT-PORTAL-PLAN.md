# Client Portal Plan — Testability Push

**Status:** Active. Pairs with `PRODUCT-SPEC.md`.
**Approved:** 2026-05-08 (Mark)
**Total scope:** ~40 hours / ~5–6 focused days
**End state:** A portal we'd put in front of a stranger.

---

## The bar

A real restaurant owner logs in and:
1. **First paint <2 seconds.** No 6-second brief hangs.
2. **What they see is driven by their goals,** not by which channels exist.
3. **A human strategist is visibly part of the product** — not just an AI dashboard.
4. **Every empty state feels like onboarding,** not a bug.
5. **Headline metrics have context.** "Reach 14k" alone is useless. "Reach 14k — typical for a 50-seat casual in a metro is 10k–18k" is useful.

We currently hit 0 of 5 cleanly. After this plan, we hit all 5.

---

## Phase A — Make it work (~6 hours)

Critical performance + empty-state fixes. Without these, no real testing.

| # | Item | File(s) | Effort |
|---|---|---|---|
| A1 | Parallelize `checkClientAccess` (4 sequential DB calls → 1 roundtrip) | `src/lib/dashboard/check-client-access.ts` | 1h |
| A2 | Pull brief out of `/api/dashboard/load` path; brief streams in async | `src/app/api/dashboard/load/route.ts`, `src/components/dashboard/todays-brief.tsx` | 2h |
| A3 | Remove duplicate `getDashboardData()` fetch | `src/app/dashboard/page.tsx` | 0.5h |
| A4 | Merge pulse-data N+1 (aggregate + 14-day series in one query) | `src/lib/dashboard/get-pulse-data.ts` | 1h |
| A5 | Add compound indexes on `reviews`, `deliverables`, `scheduled_posts` | new migration | 0.5h |
| A6 | Error boundary + retry on dashboard fetch | `src/app/dashboard/page.tsx` | 1h |
| A7 | Unify "connect" flow to single canonical route | `/dashboard/connect-accounts` (delete redirect), all CTAs | 0.5h |

**Outcome:** Dashboard loads fast, doesn't hang, doesn't fail silently.

---

## Phase B — Make it goal-led (~22 hours, the strategic alignment)

This is the work the comprehensive audit surfaced. Replaces channel-led generic dashboard with the spec's goal-led product.

| # | Item | File(s) | Effort |
|---|---|---|---|
| B1 | Replace `/dashboard/goals` content with the 8 spec goals (uses migration 092 `goals_catalog`) | `src/app/dashboard/goals/page.tsx` | 4h |
| B2 | Goal-driven dashboard layout — pulse cards become goal-progress cards derived from active goals | `src/app/dashboard/page.tsx`, new `goal-progress-card.tsx` | 5h |
| B3 | Restaurant shape capture + display surface ("Your restaurant") | new `/dashboard/restaurant` page | 3h |
| B4 | "Your strategist" card on dashboard | new `your-strategist.tsx` | 2h |
| B5 | Playbook explanation per active goal ("what we're doing about this") | new component, reads `goal_playbooks` | 3h |
| B6 | Benchmarking context on top 3 pulse metrics | extend pulse cards + heuristic table | 3h |
| B7 | Empty states for goals/pulse/weekly ("connect X to see Y", not "—") | various | 2h |

**Decision logged separately (0006):** **Replace** the dashboard with the goal-led version; **keep** channel pages as drill-down detail. Goal-led at the top of the funnel, channel-detail underneath.

**Outcome:** What the owner picked as goals drives what they see. Strategist visible. Metrics in context.

---

## Phase C — Polish + structural cleanup (~12 hours)

The difference between "testable" and "impressive."

| # | Item | File(s) | Effort |
|---|---|---|---|
| C1 | Kill thin hub pages — redirect to primary functional child | `/dashboard/social`, `/dashboard/local-seo`, `/dashboard/email-sms` | 2h |
| C2 | Add Approvals to main nav with badge count | `src/app/dashboard/layout.tsx` | 1h |
| C3 | First-week guided experience rail (replaces scattered "connect accounts" CTAs) | new component on dashboard | 3h |
| C4 | Quarterly review surface stub | new `/dashboard/quarterly-review` page | 2h |
| C5 | Consolidate brand/profile into "Your business" | merge `/dashboard/profile` + `/profile/brand-guidelines` | 2h |
| C6 | Educational tooltips on major metrics | shared tooltip component, content per metric | 2h |

**Outcome:** Polished, focused, structurally clean.

---

## What we explicitly DON'T do in this push

To prevent scope creep:

- Full quarterly review flow (just the placeholder surface for now)
- Owner-facing playbook IP editor (strategists manage in admin; clients see output)
- Multi-location-aware redesign (single-loc works first)
- Cross-channel narrative AI ("social is up but reviews dipped...")
- Trust signals beyond strategist surface (testimonials, case studies)
- Native mobile experience (responsive works; native-feel later)
- Onboarding redesign with owner-voice copy (waits for strategist + owner signal per decision 0005)

---

## Total + sequencing

| Phase | Hours | Days | Status |
|---|---|---|---|
| A — Make it work | 6 | 1 | In progress |
| B — Make it goal-led | 22 | 3 | Pending |
| C — Polish | 12 | 1.5 | Pending |
| **Total** | **~40** | **~5–6** | |

Sequencing: A → B as a single push (~4 days). C in the following 1–2 days. Then resume goal layer work (Q-review flow, onboarding redesign with owner-voice copy) on a solid testable foundation.

---

## Alignment with PRODUCT-SPEC

Passes the 6-point check strongly. Most spec-aligned work in the repo's history:

1. **Goal alignment:** Phase B installs the goal-led framing in the surfaces clients see daily.
2. **Customer band:** Tier 2 owners are the testers.
3. **Strategist role:** Phase B surfaces the strategist (B4) and the playbook (B5).
4. **Decline-to-sell:** Goal-led framing makes shape-goal mismatches visible, enabling the cultural principle at the right moment.
5. **NOT violations:** None.
6. **Moat compounding:** Trust (polish + strategist visible). Strategist leverage. Playbook IP visible. Three of three.

---

## Open questions logged for future

These came up in the audit but don't block this push:

- Multi-location selector consistency across pages
- AI-driven cause-and-effect narratives on metrics
- Strategist override audit trail visible to clients?
- How to handle goal-shape mismatch in UI (relates to decline-to-sell principle implementation)
- What the "first 30 days" experience looks like end-to-end
