# Tool catalog reconciliation

The owner's tool-builder document (`apnosh-tool-builder.html`, 2026-07-28) lists **63 tools in 12
sections** with 6 unit types and 7 builder rules. This file maps every one of them onto the
codebase, so the next comparison is a file read instead of an afternoon of scraping.

**How to keep this honest:** when a card goes live, move its row. When the doc changes, re-run the
comparison against this file first. Rows state what IS, not what is planned.

## The 7 builder rules → existing infrastructure

| Rule | Where it lives |
|---|---|
| B1 six unit types | Setup cards (`setup/cards.ts`) · services (priced catalog) · assets (creator marketplace) · automations (flow builder, unwired) · consulting (`SetupCard.kind`, no card yet) · guide (the free-lane pattern) |
| B2 includes fold into parents | `deliverables.included` on services; lane `whatYouGet` |
| B3 dependencies auto-chip | Requirements library + vault: `needs` ids, `intakeFor()` pulls prerequisites, `client_requirements` dedupes across cards |
| B4 three-slot rule | The three-lane pattern; `laneViolations()` refuses slots the platform cannot back, and refuses DIY/AI slots on consulting |
| B5 billing rails | Checkout's separate rails (one-time / monthly / per-pack) |
| B6 arrange-it-for-me | The plan brain (`recommend-plays`, `buildFromAtoms`) |
| B7 FUTURE shows honestly | The coming-soon allowlist (`catalog-availability.ts`) with named reasons |

## Live and buyable (3-lane setup cards)

| Doc tool | Card id | Note |
|---|---|---|
| GBP Complete Setup | `gbp` | The reference card |
| Listings Sync | `listings` | The no-API worked example |
| Review Response Service | `reviewsreply` | Owner lanes one-pass; team lane is the monthly service |
| App Pricing Strategy | `deliverymenu` | Doc badges it Consulting; shipped as a tool (arithmetic + markup ceiling). Better and cheaper. |
| Analytics Setup | `measure` | GA4 + GSC half only; pixels/UTM/conversion-API half is not built (see "two tracking halves" below) |
| Email Platform Setup | `emaildeliver` | The SPF/DKIM/DMARC half; templates/segmentation/capture not built |
| Ordering & Reservation Wiring | `friction` | The Google-buttons half. Doc folds this into GBP Setup's includes; we deliberately sell it separately with its own AI lane and read-back proof. |

## Priced service exists, store shows coming-soon

| Doc tool | Service (price) | Store card | Blocked on |
|---|---|---|---|
| GBP Management | `gbp-posts` ($85/mo) | `gbpmgmt` | publish rail (`manage` reason) |
| Social Posting + Community Mgmt | `social-mgmt` ($475/mo) | `socialmgmt` | publish rail (`manage`) |
| Loyalty Program Setup | `loyalty` ($625) | `loyalty` | POS integration + send rail (`pos`) |
| Newsletter Service | send services | `news` | **the send rail** |
| Email Automations (welcome/birthday/win-back) | send services | `welcome` `birthday` `winback` | **the send rail** |
| SMS Setup / Campaigns | `sms-found` ($310) | `slowoffer` etc. | **the send rail** |
| VIP / Regulars Tier | `vip-comms` | `earlyaccess` | **the send rail** |
| Gift Cards | — | `giftcard` | POS + commerce |
| Managed Ads | `reach`-adjacent | `reach` | ad-account connection (Meta app pending) |
| Marketplace Optimization | `delivery-opt` (**unpriced** — atom only) | via `deliverymenu` team lane | pricing decision |
| Photography / Video / UGC Packs | creative shelf + creator marketplace | `shoot` `reel` etc. | creative bar (`creative`) |
| Menu Design | `menu-eng`, `menu-photo-refresh` | — | — |
| Brand Identity / Voice | `brand-kit` | — | VOICE requirement exists in the library |
| Event Campaign | composed | `promoevent` `ticket` | partial send |
| Direct-Order Push Kit | — | `direct` | partial send |
| Site Build / SEO | `site-menu` `website-care` `ordering-setup` | `website` `localseo` | **owner decision 2026-07-27: website is its own service line, out of the setup program** |

**The send rail is one build that unlocks nine cards.** The `send` coming-soon reason now says so.

## Exists as a portal feature, not a product

| Doc tool | What exists |
|---|---|
| Reporting Service | `monthly-recap` cron + home recap section |
| Unified Dashboard (FUTURE in doc) | The portal home is this |
| Review Generation System | The review-request kit shipped (QR/link asks) |

## Nothing built

Multi-location Pages (**conflicts with one-business-per-owner; resolve before listing**) · Staff Ask
Workshop, Strategy Session, Crisis On-Call (consulting — the `kind: 'consulting'` shape now exists,
law-checked, no card yet) · Profile Optimization (social) · the free-guide long-tail · Blog/Local
Content · Campaign/Ad Landing Pages · Two-Way Text Inbox · Ad Creative Testing Packs · Press Story
Cycle · Media Kit · Award Calendar · Hosted Visit Packages (creator bookings could serve) · the
In-store FUTURE cluster (capture kit, staff workshop, on-hold audio, B2B catering, multilingual) ·
Merch & Environment · Menu Boards.

## Divergences the doc should adopt from the codebase

1. **Win-Back is not FUTURE.** The `winback` card exists; it waits only on the send rail.
2. **App Pricing Strategy is a tool, not consulting.** Shipped with a commission model, a 25%
   markup ceiling, and per-dish keep-now/keep-after arithmetic.
3. **The two tracking halves need one decision.** Doc lists Tracking Setup (§8: pixels, conversion
   API, UTM) and Analytics Setup (§12: GA4) as separate tools; our `tracking` service describes
   both but the `measure` card walks only the GA4/GSC half. Either one card with two stages, or two
   honestly-scoped cards. Undecided.
4. **The two catalogs need their bridge stated.** The doc is the tool axis; the store also sells
   the campaign axis (nights / first-visit / regulars, promote-an-event, launch). One grid holding
   both is the current state, not a decision.
