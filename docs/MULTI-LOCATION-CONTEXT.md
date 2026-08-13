# Multi-location: what we are trying to achieve

**Written 2026-08-13.** The strategic half. The technical half is `MULTI-LOCATION-PLAN.md`.

This exists so the plan can be VERIFIED rather than trusted. If the goal below is wrong, the
plan is wrong no matter how clean the code is.

---

## 1. The goal, in one sentence

**Let one restaurant group sign up once and see each of its locations honestly, without any
number being counted twice or attributed to the wrong restaurant.**

Not "support multi-location" as a feature checkbox. The measurable outcome is that a chain owner
can answer *"which of my locations is lagging?"* — a question they cannot answer today from any
tool they have, and the single most valuable thing this product could tell them.

---

## 2. Why now

The owner has chain clients ready to onboard. Until today this was speculative work for an
imagined customer; it is now a blocker in front of real revenue. That changes the calculus:
speculative architecture is a mistake, but architecture in front of a signed client is just work.

---

## 3. The thing that makes this non-obvious

**Scope is a property of the CONNECTION, not of the channel.**

The first draft of this plan said "social is brand-level, Google is per-location." That is the
common case, not a rule — the owner confirmed (2026-08-13) that some chains run a separate
Instagram per site, and the goal is 10,000+ businesses, where every shape will eventually walk
through the door. A design that hard-codes the common case has to be rebuilt the first time it
meets a real exception, and at that scale the exceptions arrive weekly.

So the model is one level more general. **Every connected account — a social profile, a Google
listing, a GA4 property, a register — carries an optional `location_id`:**

- `location_id = null` -> **brand-level**: shared by every location
- `location_id = <id>` -> **belongs to that location**

That single field expresses every shape without special cases:

| Shape | How it is expressed |
|---|---|
| One restaurant, one Instagram | one location, connections null-scoped (or scoped, identical result) |
| Three sites, one Instagram, three Google listings | Instagram null, each listing scoped |
| Three sites, three Instagrams | each Instagram scoped to its site |
| Three sites, one brand Instagram **and** a local one per site | mixed — brand-level and scoped side by side |
| A group where one site has its own website | that site's GA4 scoped, the rest null |

Nothing above is a special case in the code. It is the same rule read twice.

### The arithmetic rule that follows

> **Every connection counts exactly ONCE in any total.**

- **All locations** = brand-level connections (once) + every location-scoped connection
- **One location** = that location's scoped connections + brand-level connections, LABELLED as
  brand-level

This is what makes account-per-location wrong and this design right. Three portal accounts each
connecting the same Instagram counts that reach three times, because the connection is
duplicated rather than scoped. Here the same account appears once, and its scope says who it
belongs to.

## 4. The law

> **A number shown under a location must belong to that location, or say who it belongs to.**

When an owner switches to "Alki", the Google numbers are Alki's, and Instagram must say
**"whole brand"** rather than implying that reach belongs to one restaurant.

This is not polish. Without it, adding a location switcher does not fix blending — it hides it
behind a control that makes the blend look deliberate. That is worse than today, where at least
nothing claims to be per-location.

This law is also why this work is being done carefully rather than quickly. The failure mode of
this codebase, repeatedly, has been a number that looks confident and is wrong: followers that
read 0 because we queried a field that did not exist, a story that read "0 reached" because the
platform never reports it, a two-day change labelled as thirty days. A per-location view is a
new and larger surface for exactly that failure.

---

## 5. What success looks like

Concrete, testable, in order of value:

1. A three-location client onboards once and ends with three real location records, each tied to
   its own Google listing.
2. The dashboard defaults to **All locations** and that total is arithmetically correct — the sum
   of the locations, with social counted once.
3. Switching to one location changes the Google numbers and visibly marks social as brand-level.
4. A comparison view ranks locations, so "which site is lagging" is answerable at a glance.
5. Nothing regresses for the single-location clients who are the majority. A list of one is worse
   than a field; they should not notice this shipped.

---

## 6. What we are deliberately NOT doing

Stated so scope creep has to argue with a written decision:

- **Per-location social accounts.** Wrong grain, double counts.
- **Per-location menus, brand voice, or audience.** Most groups run one of each. Add only if a
  real client asks.
- **A parent "group" object over separate accounts.** That is the *other* architecture. Mixing
  both gives two sources of truth for one restaurant, which is how the Do Si duplicate happened
  earlier.
- **Per-location campaigns**, until requested. Most chain marketing is brand-level with occasional
  single-site pushes.

---

## 7. Designing for 10,000+ businesses

The owner's stated target changes several decisions that would otherwise be arbitrary. Worth
fixing now, because each is expensive to retrofit:

- **Sync cannot stay a serial nightly cron.** Today one cron walks every client inside a 60s
  function. At 10,000 businesses averaging even 1.5 listings, that is 15,000 API pulls a night;
  it must become a queue with per-client jobs, retries and a visible backlog. This is the single
  biggest architectural consequence of the scale target, and it is worth building the location
  loop (P1) in a queue-shaped way rather than nesting another loop inside the existing cron.
- **Indexes must assume location from the start.** `(client_id, location_id, date)` rather than
  `(client_id, date)`, so the scoped reads do not table-scan once the metrics tables are large.
- **Vendor quotas become a real constraint**, not a footnote. Google and the social vendor both
  rate-limit per app. At 10k the sync schedule has to be spread rather than fired at 4:30am.
- **The aggregate must not N+1.** "All locations" should be ONE grouped query, not a query per
  location, or the dashboard degrades with exactly the customers worth the most.
- **Onboarding must scale past hand-entry.** A 30-location group will not add locations one at a
  time on a phone. Bulk import from the Google account (which `gbp-agency.ts` already partly
  does) becomes the real path for large groups, and the manual list stays for the small ones.

## 8. The risks worth naming up front

## 9. What I need from the owner to finish the plan

1. **How many locations do the incoming chains have?** Three is a different problem from thirty
   (pagination, cron budget, a comparison view that has to rank rather than list).
2. **Does each location have its own Google listing already, verified and claimed?** If not, the
   first real work is listing claiming, not dashboards.
3. **Is billing per location or per brand?** It decides whether location is also a billing object.
4. ~~Do any run separate Instagram accounts per site?~~ **ANSWERED: some do, most do not.**
   This is why the design generalised to per-connection scope rather than per-channel rules.
