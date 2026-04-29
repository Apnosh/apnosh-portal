# Client dashboard audit — what to ship to v1

Goal: identify which dashboard surfaces are ready to put in front of paying
clients, which to hide, and what the v1 sidebar should look like.

Method: read every page file under `src/app/dashboard/`, count real data
calls vs placeholder/mock markers, classify each into one of four states:

- ✅ **Solid** — works, real data, polished. Ship.
- 🟢 **Good** — works, real data, minor polish. Ship.
- 🟡 **Partial** — has structure but thin or hub-only. Polish before shipping.
- 🔴 **Mock/placeholder** — uses mock data or coming-soon shells. **Hide.**
- ➡️ **Redirect** — legacy stub. **Hide.**

---

## Surface-by-surface

### Top-level

| Route | State | Notes |
|---|---|---|
| `/dashboard` (Executive Summary) | 🟢 Good | Real metrics via `getDashboardData`. We fixed the calendar-month bug earlier. Functional but UI-heavy for a first-time client. |

### Services → Social Media

| Route | State | Notes |
|---|---|---|
| `/dashboard/social` (Performance) | 🟡 Partial | Hub page, mostly static layout. |
| `/dashboard/social/action-needed` | 🟢 Good | Real data, 6 data calls. |
| `/dashboard/social/calendar` | 🟢 Good | Real calendar of scheduled posts. |
| `/dashboard/social/requests` | 🟢 Good | Lists existing content requests. |
| `/dashboard/social/requests/new` | 🟡 Partial | Form scaffold, 0 data calls in page. |
| `/dashboard/social/performance` | 🟡 Duplicate | Shares territory with `/social`. Remove one. |
| `/dashboard/social/results` | 🟡 Orphan | 622 lines of UI but not in nav. Dead code or future feature. |

### Services → Website

| Route | State | Notes |
|---|---|---|
| `/dashboard/website` (Performance) | 🟡 Partial | Hub, mostly static. |
| `/dashboard/website/manage` | ✅ **Solid** | We just refactored. Hub + 4 spokes. |
| `/dashboard/website/traffic` | 🟢 Good | Real traffic data. |
| `/dashboard/website/health` | 🟢 Good | Site health checks. |
| `/dashboard/website/requests` | 🟡 Partial | 3 placeholder markers in code. |
| `/dashboard/website/requests/new` | 🟡 Partial | 7 placeholder markers. |

### Services → Local SEO

| Route | State | Notes |
|---|---|---|
| `/dashboard/local-seo` (Performance) | 🟡 Partial | Hub, 0 data calls. |
| `/dashboard/local-seo/locations` | 🟡 Partial | 0 data calls, 200 lines static. |
| `/dashboard/local-seo/reviews` | 🟢 Good | Real review pulls. |
| `/dashboard/analytics` | 🟡 Partial | Generic, 1 data call. Probably can roll into `/local-seo`. |

### Services → Email & SMS

| Route | State | Notes |
|---|---|---|
| `/dashboard/email-sms` | 🟢 Good | Real overview. |
| `/dashboard/email-sms/campaigns` | 🟢 Good | |
| `/dashboard/email-sms/list` | 🟢 Good | |
| `/dashboard/email-sms/performance` | 🟢 Good | |

### Brand

| Route | State | Notes |
|---|---|---|
| `/dashboard/assets` | 🟢 Good | 7 data calls, 6 placeholder markers (likely empty-state copy). |

### Communication

| Route | State | Notes |
|---|---|---|
| `/dashboard/messages` | 🟢 Good | Real threaded inbox. 16 data calls. |
| `/dashboard/briefs` (Weekly Briefs) | 🟢 Good | Real data, simple list view. |
| `/dashboard/reports` | 🟢 Good | 8 data calls. |

### Footer (account-level)

| Route | State | Notes |
|---|---|---|
| `/dashboard/profile` (Business Profile) | 🟢 Good but bloated | 1105 lines, 23 placeholder markers. Works, but long. Polish target. |
| `/dashboard/profile/strategy` (My Strategy) | 🟢 Good | 314 lines, 7 data calls. |
| `/dashboard/profile/brand-guidelines` | 🟢 Good | AI-generated brand book. 39 placeholder markers (likely empty-state copy). |
| `/dashboard/connected-accounts` | 🟢 Good | Real OAuth flows. 361 lines. |
| `/dashboard/connect-accounts` | ➡️ Redirect | Legacy stub → connected-accounts. **Hide from sidebar.** |
| `/dashboard/agreements` | 🟢 Good | Contract list. |
| `/dashboard/billing` | 🟢 Good | Subscription + payment view. |
| `/dashboard/settings` | 🟢 Good | 515 lines, 13 data calls. |
| `/dashboard/help` | 🟢 Good | Static help page. Fine. |

### Orphans (not in main nav, but reachable)

| Route | State | Notes |
|---|---|---|
| `/dashboard/calendar` | 🟡 Partial | Generic calendar view. Duplicate of `/social/calendar`? |
| `/dashboard/notifications` | 🟢 Good | 9 data calls. Real notification feed. |
| `/dashboard/approvals` | 🔴 **Mock** | Uses `mock-deliverables`. 936 lines of UI on fake data. |
| `/dashboard/goals` | 🟡 Partial | Onboarding goal-picker. Only useful first-run. |
| `/dashboard/orders` | 🟢 Good | Storefront for additional services. Off-path for v1 onboarding. |
| `/dashboard/orders/checkout` | 🟢 Good | |
| `/dashboard/orders/sandbox` | 🛠️ Admin | Test checkout. **Hide.** |
| `/dashboard/orders/success` | 🟢 Good | |
| `/dashboard/tools` | 🛠️ **Coming-soon shells** | 800 lines, 14 `comingSoon: true` flags. AI tools UI without real implementations. **Hide.** |

---

## Recommended v1 sidebar

The principle: show only ✅ Solid + 🟢 Good surfaces. Hide everything 🟡, 🔴, 🛠️, and ➡️ for v1. Unhide each as it's polished.

```
Today (Executive Summary — simplified)

MY BUSINESS
  Business profile          /dashboard/profile
  Brand guidelines          /dashboard/profile/brand-guidelines
  Connected accounts        /dashboard/connected-accounts

MY SERVICES (gated by enrolledServices)
  Website                   /dashboard/website  ← only show if enrolled
    Manage site             /dashboard/website/manage          ✅
    Traffic                 /dashboard/website/traffic
    Health                  /dashboard/website/health
    Change requests         /dashboard/website/requests
  Social Media              /dashboard/social
    Calendar                /dashboard/social/calendar
    Action needed           /dashboard/social/action-needed
    Content requests        /dashboard/social/requests
  Local SEO                 /dashboard/local-seo/reviews        ← skip the empty hubs
  Email & SMS               /dashboard/email-sms
    Campaigns               /dashboard/email-sms/campaigns
    List & Audience         /dashboard/email-sms/list

ASSETS
  My assets                 /dashboard/assets

COMMUNICATION
  Messages                  /dashboard/messages
  Weekly briefs             /dashboard/briefs

ACCOUNT
  Billing                   /dashboard/billing
  Agreements                /dashboard/agreements
  Settings                  /dashboard/settings
  Help                      /dashboard/help
```

**Total visible items for a typical client (enrolled in 2 services): ~13.**
Was ~30. Half the noise.

---

## What to hide for v1

These pages stay in the codebase (so deep links still work and we can polish later) but get pulled from the sidebar:

| Route | Why hide |
|---|---|
| `/dashboard/social/performance` | Duplicate of `/dashboard/social` |
| `/dashboard/social/results` | Orphan, not in nav already |
| `/dashboard/website` (Performance hub) | Hub with no real content; dive direct to `/manage` |
| `/dashboard/local-seo` (Performance hub) | Empty hub |
| `/dashboard/local-seo/locations` | 200 lines of static, no data |
| `/dashboard/analytics` | Thin, redundant with `/local-seo` |
| `/dashboard/website/requests/new` | 7 placeholder markers; works but rough |
| `/dashboard/social/requests/new` | Same — works but rough |
| `/dashboard/profile/strategy` | Advanced. Hide until polished. |
| `/dashboard/reports` | Probably overlaps Weekly briefs. Audit overlap, pick one. |
| `/dashboard/calendar` | Orphan, duplicate of `/social/calendar` |
| `/dashboard/approvals` | 🔴 **Uses mock data**. Rebuild on real data later. |
| `/dashboard/tools` | 🛠️ All "coming soon" shells. Ship when implemented. |
| `/dashboard/orders/*` | Off-path for v1. Re-enable when you want to upsell. |
| `/dashboard/goals` | First-run only; surface as a setup card, not a sidebar item. |
| `/dashboard/connect-accounts` | ➡️ Legacy redirect. Just kill from sidebar. |
| `/dashboard/notifications` | Surface via the bell icon already in the header. No sidebar item needed. |

---

## What to polish before shipping v1

For each ✅/🟢 surface kept, do a 30-minute sweep:

1. **First-run state** — what does it look like with zero data? Add an empty state with a "what to do" CTA.
2. **Loading state** — does it flash blank? Add a skeleton.
3. **Error state** — if data fetch fails, does the user see a useful error or a crash?
4. **Mobile** — does it work on a phone? (Most clients will check on phone first.)
5. **Copy review** — every label and message read by a non-technical owner.

That's a checklist of ~5 minutes × 13 surfaces = roughly an afternoon of polish.

---

## Recommended order

1. **Hide the noise from the sidebar** (1 hour). Edit `src/app/dashboard/layout.tsx`. Reversible.
2. **First-run empty states** on the 13 kept surfaces (half a day to a day).
3. **Mobile pass** on the 13 surfaces (half a day).
4. **Copy pass** by you, reading every page as a customer would (half a day).
5. **Onboard 2 clients** as a pilot. Watch what they hit.
6. **Iterate.**

That's 2-3 days of focused work, then real-client testing.

---

## Caveats

- This audit is a fast pass based on file size, data-call counts, and
  placeholder-marker counts. A few of the "Good" calls might be hiding
  surprises. Real validation comes from clicking through every page as
  a client would.
- "Solid" doesn't guarantee bug-free. Sentry (just shipped) will surface
  the actual issues clients hit.
- Service-area gating already exists via `enrolledServices`. The v1 sidebar
  should respect it rigorously so each client only sees their own services.
