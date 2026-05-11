# 0006 — Replace dashboard, keep channels as drill-downs

**Date:** 2026-05-08
**Status:** Accepted
**Decided by:** Mark + Claude

## Context

The comprehensive client-portal audit (`docs/CLIENT-PORTAL-PLAN.md`) surfaced that the current dashboard is channel-led ("your customers / reputation / reach") while the spec calls for goal-led organization. Two paths forward:

- **Replace** the dashboard with goal-driven content.
- **Coexist** — keep channel-organized dashboard, add goal layer alongside.

## Decision

**Replace the dashboard (`/dashboard`) with the goal-led version. Keep the channel pages (`/dashboard/social`, `/local-seo`, `/email-sms`, `/website`) as drill-down detail.**

Goal-led at the top of the funnel. Channel pages remain reachable but are subordinate to the goal lens.

## Reasoning

- **Spec alignment.** `PRODUCT-SPEC.md` is explicit: "channels serve goals; goals lead." Coexistence dilutes this — it tells the owner both stories at once.
- **Where the eyeballs land.** The dashboard is what owners see when they log in. If it's channel-organized, every other surface aligning to goals is fighting an uphill battle.
- **Drill-down still works.** Channel pages (Posts, Email & SMS, Local SEO, etc.) have legitimate uses for owners who want post-level detail. Keeping them as drill-downs preserves that without compromising the headline organization.
- **Risk asymmetry.** "Replace and find out the goal lens is wrong" costs us a revert. "Coexist forever" costs us a permanently confused product.

## Alternatives considered

- **Pure coexist.** Rejected — see above.
- **Replace everything (including channel pages).** Rejected — too aggressive. Drill-down channel detail is genuinely useful and not in tension with goal-led top level.
- **Phase the transition** (channel pages in a "Detail" submenu). Rejected — adds nav complexity without value.

## Consequences

- Phase B of the client-portal plan ships the goal-driven dashboard layout.
- Channel pages (`/dashboard/social`, `/local-seo`, `/email-sms`, `/website`) get a small visual demotion — they're still in the sidebar, but the dashboard pulls headline attention to goals.
- Some existing dashboard components (`PulseCards`, `ServicesThisMonth`) get retired or repurposed.
- Empty states across the dashboard become goal-aware ("connect Google Business to track progress on `better_reputation`").
- Channel-page reorganization deferred (Phase C item C1 kills the thin hub pages).
