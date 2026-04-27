# Google Business Profile Performance API — Application Pack

This is the text to paste into the Google Cloud Console OAuth verification + API access request flow when applying for production access to the Business Profile Performance API.

---

## Where to apply

1. Go to https://console.cloud.google.com/
2. Select the project you use for the portal's existing Google integrations (Drive, Analytics, Search Console)
3. **APIs & Services → Library** → search "Business Profile Performance API" → click **Enable**
4. **APIs & Services → OAuth consent screen** → make sure status is **In production** (not Testing)
5. If you also need access to the related management API: enable **My Business Business Information API** and **My Business Account Management API** the same way
6. **APIs & Services → OAuth consent screen → Scopes** → add `https://www.googleapis.com/auth/business.manage`
7. Save and start verification flow

You may also need to fill out the GBP API access form at https://support.google.com/business/contact/api_default — many teams report this is required before quota is granted.

---

## Application URL

```
https://portal.apnosh.com
```

## Privacy Policy URL

```
https://portal.apnosh.com/privacy
```

## Terms of Service URL

```
https://portal.apnosh.com/terms
```

## Demo / About URL (for reviewer to verify the integration)

```
https://portal.apnosh.com/about/local-seo
```

## Authorized domains

```
apnosh.com
portal.apnosh.com
```

## Logo

Use the existing Apnosh logo at the apnosh.com root (the same one already shown on the portal).

---

## Application title

```
Apnosh Local SEO Reporting
```

## Brief description (one sentence)

```
Apnosh is a Seattle-based marketing agency that uses the Business Profile Performance API to surface daily Google Business Profile performance metrics to our 11 restaurant clients via their private Apnosh portal at portal.apnosh.com.
```

---

## Detailed use case (paste into "How will you use this scope?")

```
Apnosh is a Seattle-based content and growth agency operating the Apnosh client portal at portal.apnosh.com. The portal is a private B2B SaaS used by our restaurant clients to view performance across the channels we manage on their behalf — content, local SEO, paid advertising, and reputation. Today the portal services 11 active restaurant clients across the Pacific Northwest, with 21 verified Google Business Profile locations total under our Manager-level access on a single agency Google account.

We are requesting access to the Google Business Profile Performance API for one specific purpose: to read each managed location's own performance metrics on a daily basis and render them in that client's private dashboard. Specifically, we will call the following endpoints:

- accounts.locations.list -- to enumerate the locations our agency account manages
- locations.fetchMultiDailyMetricsTimeSeries -- to pull daily impressions (Search vs Maps, Mobile vs Desktop), customer actions (calls, direction requests, website clicks, message conversations, bookings), and photo views

Why we need API access (vs CSV export):
The current bulk CSV export from Business Profile Manager returns only aggregate totals per report period, not daily granularity. Restaurants need to spot day-of-week patterns, isolate the impact of specific campaigns, and respond to sudden drops in real time. Daily-granular data via the API enables us to:

1. Render daily and weekly trend charts in each client's Local SEO dashboard
2. Calculate 30-day-vs-prior-30-day deltas, highlight anomalies
3. Surface "top search queries" per day so the client knows what people search to find them
4. Trigger alerts when a metric drops outside its normal range
5. Generate the monthly performance reports we currently assemble manually

Who sees the data:
Each restaurant operator (the actual location owner) sees only their own location's data when logged into the portal. Apnosh staff (currently two account managers and the agency owner) see all clients' data because we are the agency operating those listings on the operators' behalf. We never aggregate one client's data with another's, never share data outside the operator-and-Apnosh relationship, and never use the data for advertising or to train machine learning models.

Our authorization to access these locations:
Apnosh holds Manager-level access on all 21 verified Google Business Profile locations under a single agency Google account. Each location's owner explicitly granted this access through the standard Business Profile Manager invitation flow. We can supply a screenshot of our Business Profile Manager dashboard showing the 21 verified locations on request.
```

---

## Data handling explanation (paste where asked)

```
GBP data is stored in a private Supabase Postgres database hosted in AWS us-west-2. Access is gated by row-level security policies — each restaurant client's portal login can only read rows tied to their own client_id. Apnosh staff access is limited to the assigned account manager and the agency owner.

OAuth tokens for the Business Profile API are stored encrypted at rest in the integrations table and are never exposed in client-side JavaScript. All API traffic uses HTTPS. The portal application itself is hosted on Vercel.

We do not transfer GBP data to third parties except for the sub-processors listed in our Privacy Policy (Supabase for storage, Vercel for hosting, Google Cloud for the API itself). We do not sell GBP data. We do not use GBP data for advertising. We do not train machine learning models on GBP data. We do not allow human review of GBP data except as required to provide support to the specific client whose data it is, and only when that client has been notified.

We retain GBP data for 24 months for trend analysis. On client offboarding from Apnosh, we delete that client's GBP data within 7 days of the offboarding date.

We comply with the Google API Services User Data Policy and, where applicable, the Limited Use requirements.
```

---

## Quota request

```
We need approximately 125 API calls per day at steady state (21 locations × ~6 endpoints called by our daily ingest cron). To allow for occasional manual refreshes by Apnosh staff, retries on transient errors, and onboarding new clients without quota concerns, we request a daily quota of 1,000 calls/day, which is roughly 8x our steady-state need.
```

---

## OAuth scopes requested

```
https://www.googleapis.com/auth/business.manage
```

Justification: this is the minimum scope required to call the Business Profile Performance API. We use it in read-only patterns; we do not modify, write, or delete anything via the API.

---

## Are you requesting sensitive or restricted scopes?

`business.manage` is **not** classified as a sensitive or restricted scope under Google's user data policy as of this writing. If asked, the answer is No to "sensitive scopes" — but be prepared for a verification process anyway because Business Profile data is treated cautiously.

---

## Demo video script (if requested)

Some applications require a 90-second screen-recorded demo. Use this script:

> "Hi, this is the Apnosh portal at portal.apnosh.com. Apnosh is a Seattle marketing agency that manages 21 Google Business Profiles for our restaurant clients.
>
> When a client logs in, they see a dashboard for their location — content, ads, reviews, and a Local SEO tab.
>
> [Click into Local SEO tab]
>
> The Local SEO tab shows their Google Business Profile performance: impressions on Search and Maps, calls, direction requests, website clicks, and the top search queries that surfaced their listing.
>
> Today we populate this tab by manually exporting CSV files from Business Profile Manager once a month — which only gives us aggregate monthly totals.
>
> With API access, we'll automate this. Every morning a Vercel cron job will call the Performance API for each of our 21 locations, pull daily metrics, and store them in our private Supabase database. Each row is tied to a specific client_id and visible only to that client's login through row-level security.
>
> We use only the business.manage scope, only to read data, only for the locations the operator has authorized us to manage as a Manager on Business Profile.
>
> Thanks."

Record this with QuickTime, voiceover the on-screen actions, upload to YouTube as Unlisted, paste the link.

---

## Screenshots to attach (if asked)

1. **Your 21 verified locations in Business Profile Manager** (proves Manager access)
2. **The Apnosh portal client view** showing the Local SEO tab placeholder (proves the data-display surface exists)
3. **The /about/local-seo page** (proves you've publicly documented the integration)

---

## After you submit

- Initial response: 1–3 business days, sometimes same day
- If they ask follow-up questions: respond within 24 hours, be specific
- Common follow-ups: "Can you show us a screenshot of where the data appears in the user-facing portal?" → screenshot the Local SEO tab
- Do **not** request additional scopes during the review — finish with `business.manage` only
- If denied (uncommon for someone with active Manager access): the denial email lists reasons. Address each, re-submit. Successful re-submission rate is high.

---

## Common pitfalls (avoid these)

- **Don't say "we're building a tool"** — say "we operate a portal at portal.apnosh.com used daily by our 11 restaurant clients"
- **Don't ask for higher quota than you'll use** — 1,000/day with 125/day actual use is the right sweet spot
- **Don't list scopes you don't need** — only `business.manage`
- **Don't be vague about who sees the data** — name the actors (restaurant operators see their own data; agency staff see clients they manage)
- **Don't claim Limited Use compliance without meaning it** — the policy text in our Privacy + ToS is real; the data flow we describe is what we actually do
