/**
 * Apnosh Score audit engine.
 *
 * Runs a catalog of checks against a client's existing data and
 * produces:
 *   - Overall score (0-100, weighted average of 3 categories)
 *   - Per-category scores
 *   - List of findings with severity, evidence, benchmark, CTA
 *
 * Designed to use data we ALREADY have via the existing channel
 * connections + sync jobs. Findings that need data we don't yet
 * collect (map rank, listings claim status, hours-across-sources)
 * are listed in the README of this folder and tracked as v2.
 *
 * Catalog (v1):
 *   Get Found      — Profile completeness, Local search demand, Connection health
 *   Look Engaged   — Reviews waiting, Review sentiment, Photo coverage
 *   Stay Active    — Menu freshness, Recent activity
 */

import { createClient as createAdminClient } from '@supabase/supabase-js'

export type Severity = 'critical' | 'warning' | 'strength'
export type Category = 'get_found' | 'look_engaged' | 'stay_active'

export interface Finding {
  id: string
  category: Category
  severity: Severity
  headline: string
  evidence: string
  benchmark: string
  ctaPrimary?: string
  ctaSecondary?: string
  /** Pre-filled chat prompt — when set, clicking ctaPrimary opens
   *  the AI chat with this text in the textarea. */
  ctaPrompt?: string
  /** 0-100 score for THIS finding (used to compute category score). */
  score: number
  /** Relative weight of this finding within its category. */
  weight: number
  /** Estimated overall-score points gained if this finding hits 100.
   *  Used for "+X points possible" badges and smart quick-win ranking. */
  scoreImpact?: number
  /** 1-2 sentence trust builder: why does this matter? Cite source. */
  whyItMatters?: string
  /** How easy is this to fix? 1=one-click, 2=10-min owner action,
   *  3=requires real work, 4=requires outside help. Used to rank quick wins. */
  easeOfFix?: 1 | 2 | 3 | 4
}

export interface AuditResult {
  clientId: string
  ranAt: string
  scoreOverall: number
  scoreGetFound: number
  scoreLookEngaged: number
  scoreStayActive: number
  findings: Finding[]
  /** Optional Claude-written 3-sentence personalized summary. */
  narrative?: string | null
}

export interface AuditTrend {
  /** Most recent audit run before today. */
  previous: {
    ranAt: string
    scoreOverall: number
    scoreGetFound: number
    scoreLookEngaged: number
    scoreStayActive: number
  } | null
  /** Recent history (up to 8 weeks of scores) for sparkline rendering. */
  history: Array<{ ranAt: string; scoreOverall: number }>
}

const CATEGORY_WEIGHTS: Record<Category, number> = {
  get_found: 40,
  look_engaged: 30,
  stay_active: 30,
}

/* Per-cuisine benchmarks. Defaults at the bottom apply when cuisine
   isn't in the table. Adjust as we gather real client data. */
interface Benchmarks {
  photoTarget: number          // GBP photo count: "top performers have N+"
  reviewsPerMonth: number      // baseline expected for healthy operation
  postsPerMonth: number        // baseline posting cadence
  monthlyImpressions: number   // baseline GSC impressions
}
const CUISINE_BENCHMARKS: Record<string, Benchmarks> = {
  fine_dining:    { photoTarget: 50, reviewsPerMonth: 8,  postsPerMonth: 6,  monthlyImpressions: 1800 },
  steakhouse:     { photoTarget: 40, reviewsPerMonth: 8,  postsPerMonth: 5,  monthlyImpressions: 1500 },
  italian:        { photoTarget: 35, reviewsPerMonth: 10, postsPerMonth: 5,  monthlyImpressions: 1500 },
  pizza:          { photoTarget: 25, reviewsPerMonth: 15, postsPerMonth: 5,  monthlyImpressions: 2500 },
  taqueria:       { photoTarget: 20, reviewsPerMonth: 12, postsPerMonth: 4,  monthlyImpressions: 1800 },
  cafe:           { photoTarget: 25, reviewsPerMonth: 10, postsPerMonth: 5,  monthlyImpressions: 1200 },
  bakery:         { photoTarget: 30, reviewsPerMonth: 8,  postsPerMonth: 5,  monthlyImpressions: 1000 },
  fast_casual:    { photoTarget: 20, reviewsPerMonth: 12, postsPerMonth: 4,  monthlyImpressions: 1800 },
  food_truck:     { photoTarget: 15, reviewsPerMonth: 6,  postsPerMonth: 5,  monthlyImpressions: 800 },
  bar:            { photoTarget: 25, reviewsPerMonth: 10, postsPerMonth: 6,  monthlyImpressions: 1500 },
  asian:          { photoTarget: 25, reviewsPerMonth: 10, postsPerMonth: 4,  monthlyImpressions: 1500 },
  mexican:        { photoTarget: 25, reviewsPerMonth: 12, postsPerMonth: 4,  monthlyImpressions: 1800 },
  default:        { photoTarget: 30, reviewsPerMonth: 10, postsPerMonth: 4,  monthlyImpressions: 1500 },
}

function getBenchmarks(cuisine: string | null | undefined): Benchmarks {
  if (!cuisine) return CUISINE_BENCHMARKS.default
  const key = cuisine.toLowerCase().replace(/\s+/g, '_')
  return CUISINE_BENCHMARKS[key] ?? CUISINE_BENCHMARKS.default
}

/* Per-finding context passed to each check function. */
interface CheckContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any
  clientId: string
  benchmarks: Benchmarks
}

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ─── individual checks ────────────────────────────────────────────────

/* GET FOUND — Profile completeness across all data sources.
 *
 * Truth lives in different tables for the same logical field:
 *   - Business name: clients.name OR gbp_locations.location_name
 *   - Address: clients.location OR client_profiles.full_address OR gbp_locations.address
 *   - Phone: clients.phone OR client_profiles.business_phone
 *   - Website: clients.website OR client_profiles.website_url
 *   - Hours: gbp_locations.hours OR client_profiles.hours
 *   - Description / Cuisine / Price: client_profiles only
 *
 * We give credit if ANY source has the field. Avoids false "missing"
 * claims from looking in the wrong place.
 */
async function checkProfileCompleteness(ctx: CheckContext): Promise<Finding> {
  const { admin, clientId } = ctx
  const [clientRes, profileRes, gbpRes] = await Promise.all([
    admin.from('clients')
      .select('name, location, website, phone')
      .eq('id', clientId)
      .maybeSingle(),
    admin.from('client_profiles')
      .select('business_description, cuisine, price_range, full_address, city, state, business_phone, website_url, hours')
      .eq('client_id', clientId)
      .maybeSingle(),
    admin.from('gbp_locations')
      .select('location_name, address, hours')
      .eq('client_id', clientId)
      .limit(1)
      .maybeSingle(),
  ])
  const c = (clientRes.data ?? {}) as Record<string, unknown>
  const p = (profileRes.data ?? {}) as Record<string, unknown>
  const g = (gbpRes.data ?? {}) as Record<string, unknown>

  const has = (v: unknown) => v !== null && v !== undefined && v !== ''

  const FIELDS: Array<{ label: string; present: boolean }> = [
    { label: 'Business name', present: has(c.name) || has(g.location_name) },
    { label: 'Address',       present: has(c.location) || has(p.full_address) || has(p.city) || has(g.address) },
    { label: 'Phone',         present: has(c.phone) || has(p.business_phone) },
    { label: 'Website',       present: has(c.website) || has(p.website_url) },
    { label: 'Hours',         present: has(g.hours) || has(p.hours) },
    { label: 'Description',   present: has(p.business_description) },
    { label: 'Cuisine type',  present: has(p.cuisine) },
    { label: 'Price range',   present: has(p.price_range) },
  ]
  const filled = FIELDS.filter(f => f.present).length
  const pctFilled = (filled / FIELDS.length) * 100
  const missing = FIELDS.filter(f => !f.present).map(f => f.label)

  const severity: Severity = pctFilled >= 90 ? 'strength' : pctFilled >= 60 ? 'warning' : 'critical'
  const score = Math.round(pctFilled)

  if (severity === 'strength') {
    return {
      id: 'profile_completeness',
      category: 'get_found',
      severity,
      headline: `Profile is ${Math.round(pctFilled)}% complete`,
      evidence: `${filled} of ${FIELDS.length} key fields filled.`,
      benchmark: `Top performers fill 95%+ of available fields. You're ahead of the curve.`,
      whyItMatters: 'Google ranks complete profiles higher in local search. Owners typically miss 2-4 fields after initial setup and never go back.',
      score,
      weight: 1,
      scoreImpact: 0,
      easeOfFix: 1,
    }
  }
  return {
    id: 'profile_completeness',
    category: 'get_found',
    severity,
    headline: `Your profile is missing ${missing.length} key field${missing.length === 1 ? '' : 's'}`,
    evidence: `Missing: ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? `, and ${missing.length - 4} more` : ''}.`,
    benchmark: `Top performers fill 95%+ of available fields. You're at ${Math.round(pctFilled)}%.`,
    whyItMatters: 'Google ranks complete profiles higher in local search. Each missing field is a signal that lowers your visibility. Fields like phone and website also directly affect customer action — without them, people can\'t call or click through.',
    ctaPrimary: 'Help me fill these in',
    ctaSecondary: 'Skip',
    ctaPrompt: `My Google profile is missing ${missing.length} fields: ${missing.join(', ')}. Can you walk me through filling each one in?`,
    score,
    weight: 1.5,
    easeOfFix: 1,
  }
}

/* GET FOUND — Local search demand from GSC. */
async function checkSearchDemand(ctx: CheckContext): Promise<Finding> {
  const { admin, clientId, benchmarks } = ctx
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
  const { data } = await admin
    .from('search_metrics')
    .select('total_impressions, total_clicks')
    .eq('client_id', clientId)
    .gte('date', since)
  const rows = (data ?? []) as Array<{ total_impressions: number; total_clicks: number }>
  const impressions = rows.reduce((s, r) => s + (r.total_impressions ?? 0), 0)
  const clicks = rows.reduce((s, r) => s + (r.total_clicks ?? 0), 0)

  if (impressions === 0) {
    return {
      id: 'search_demand',
      category: 'get_found',
      severity: 'warning',
      headline: 'No search data yet',
      evidence: 'We don\'t have Search Console data for the last 30 days.',
      benchmark: 'Connect Google Search Console so we can show local search demand for your business.',
      whyItMatters: 'Search Console shows how often people see your business in Google. Without it, you\'re flying blind on what queries drive traffic.',
      ctaPrimary: 'Connect Search Console',
      ctaPrompt: 'How do I connect Google Search Console to Apnosh?',
      score: 30,
      weight: 1,
      easeOfFix: 2,
    }
  }
  /* Score: impressions vs cuisine benchmark + ctr bonus. */
  const score = Math.min(100, Math.round(
    (impressions / benchmarks.monthlyImpressions) * 60
    + (clicks / impressions) * 4000,
  ))
  const severity: Severity = score >= 70 ? 'strength' : score >= 40 ? 'warning' : 'critical'

  return {
    id: 'search_demand',
    category: 'get_found',
    severity,
    headline: severity === 'strength'
      ? `Strong: ${impressions.toLocaleString()} search impressions / 30 days`
      : `${impressions.toLocaleString()} search impressions / 30 days`,
    evidence: `${clicks.toLocaleString()} clicks · ${((clicks / impressions) * 100).toFixed(1)}% click rate.`,
    benchmark: severity === 'strength'
      ? 'Strong demand for your business. Capitalize with content + posts.'
      : `Cuisine benchmark: ${benchmarks.monthlyImpressions.toLocaleString()}+ impressions/mo. Posting, photos, and reviews are the biggest levers.`,
    whyItMatters: 'Search impressions are the top of your funnel — the more people see you, the more visits, calls, and orders. CTR shows whether your listing convinces them once they see it.',
    score,
    weight: 1,
    easeOfFix: 3,
  }
}

/* GET FOUND — Connection health. Broken connections = invisible data = poor SEO signals. */
async function checkConnectionHealth(ctx: CheckContext): Promise<Finding> {
  const { admin, clientId } = ctx
  const { data } = await admin
    .from('channel_connections')
    .select('channel, status, sync_error')
    .eq('client_id', clientId)
    .in('channel', ['google_business_profile', 'google_search_console', 'google_analytics'])
  const conns = (data ?? []) as Array<{ channel: string; status: string; sync_error: string | null }>
  const errored = conns.filter(c => c.status === 'error')
  /* Partially-broken: connection is "active" but sync_error contains a
     pending-API or quota message (e.g., "Google My Business API has not
     been used in project..."). These connections feed some data but not
     all — should be flagged distinctly from healthy. */
  const PARTIAL_RE = /api has not been used|api not enabled|disabled|quota|awaiting|pending/i
  const partial = conns.filter(c =>
    c.status === 'active' && c.sync_error && PARTIAL_RE.test(c.sync_error))
  const total = conns.length
  if (total === 0) {
    return {
      id: 'connection_health',
      category: 'get_found',
      severity: 'critical',
      headline: 'No accounts connected yet',
      evidence: 'Connect your Google Business Profile and Search Console so we can start working.',
      benchmark: 'Connected accounts unlock posts, review responses, hours updates, and analytics.',
      whyItMatters: 'Apnosh AI needs read/write access to your Google accounts to act on your behalf. Without connections, the AI can\'t see your data or take action.',
      ctaPrimary: 'Connect accounts',
      ctaPrompt: 'I haven\'t connected my Google accounts yet. Can you walk me through it?',
      score: 0,
      weight: 1.5,
      easeOfFix: 2,
    }
  }
  const channelNames: Record<string, string> = {
    google_business_profile: 'Business Profile',
    google_search_console: 'Search Console',
    google_analytics: 'Analytics',
  }

  if (errored.length === 0 && partial.length === 0) {
    return {
      id: 'connection_health',
      category: 'get_found',
      severity: 'strength',
      headline: `All ${total} Google connections healthy`,
      evidence: 'Data flowing for Business Profile, Search Console, Analytics.',
      benchmark: 'Keep them connected to maintain visibility and feed the AI fresh data.',
      whyItMatters: 'Healthy connections mean the AI has the latest data, can post updates, and can flag issues in real time.',
      score: 100,
      weight: 1.5,
    }
  }

  if (errored.length === 0 && partial.length > 0) {
    /* Special-case the most common partial state we see today: Google
       My Business API not yet enabled / approved. Listing + performance
       data still flows; only reviews + posts API is blocked. */
    return {
      id: 'connection_health',
      category: 'get_found',
      severity: 'warning',
      headline: `${partial.length} connection${partial.length === 1 ? '' : 's'} partially working`,
      evidence: `${partial.map(p => channelNames[p.channel] ?? p.channel).join(', ')} — listing + insights flow, but reviews/posts API is pending.`,
      benchmark: 'Most clients resolve this by enabling the Google My Business API in Google Cloud Console.',
      whyItMatters: 'The performance & insights side works fine. What\'s blocked is reading/responding to reviews and publishing posts directly via API. Once the API is enabled (or Apnosh\'s allowlist clears), this auto-resolves.',
      ctaPrimary: 'Tell me what\'s blocked',
      ctaPrompt: `My GBP connection shows 'partially working'. What does that mean for my marketing, and can you help me enable the missing API?`,
      score: 70,
      weight: 1.5,
      easeOfFix: 3,
    }
  }

  return {
    id: 'connection_health',
    category: 'get_found',
    severity: 'critical',
    headline: `${errored.length} of ${total} Google connections need attention`,
    evidence: errored.map(e => channelNames[e.channel] ?? e.channel).join(', ') + ' — sync failing.',
    benchmark: 'Broken connections mean missed analytics, lost review notifications, and stale Google data.',
    whyItMatters: 'When a connection breaks, we stop seeing new data and lose the ability to act. Most breakages are token expirations or scope-permission changes on Google\'s side — a quick reconnect fixes them.',
    ctaPrimary: 'Help me fix these',
    ctaSecondary: 'Skip',
    ctaPrompt: `Some of my Google connections are failing: ${errored.map(e => channelNames[e.channel] ?? e.channel).join(', ')}. Can you walk me through reconnecting them?`,
    score: Math.round(((total - errored.length) / total) * 60),  // capped at 60 if anything's broken
    weight: 1.5,
    easeOfFix: 1,
  }
}

/* LOOK ENGAGED — Reviews waiting for reply. */
async function checkReviewsWaiting(ctx: CheckContext): Promise<Finding> {
  const { admin, clientId, benchmarks } = ctx
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString()
  /* Pull both reviews + the GBP sync status so we can distinguish
     "no reviews" from "we can't see your reviews yet (API blocked)." */
  const [revRes, gbpRes] = await Promise.all([
    admin.from('local_reviews')
      .select('id, status, created_at_platform, source')
      .eq('client_id', clientId)
      .gte('created_at_platform', since),
    admin.from('channel_connections')
      .select('status, sync_error')
      .eq('client_id', clientId)
      .eq('channel', 'google_business_profile')
      .maybeSingle(),
  ])
  const reviews = (revRes.data ?? []) as Array<{ status: string; created_at_platform: string; source: string }>
  const open = reviews.filter(r => r.status === 'open')
  const total = reviews.length
  const gbp = gbpRes.data as { status: string; sync_error: string | null } | null
  const gbpReviewsBlocked = !!(gbp && /api has not been used|api not enabled|disabled|awaiting|pending/i.test(gbp.sync_error ?? ''))

  if (total === 0 && gbpReviewsBlocked) {
    return {
      id: 'reviews_waiting',
      category: 'look_engaged',
      severity: 'warning',
      headline: 'Reviews waiting on Google API approval',
      evidence: 'Your Google Business Profile is connected, but the reviews API is still pending approval. Listing + insights work; reviews don\'t flow yet.',
      benchmark: 'This is a Google-side process we kicked off. Usually clears within days.',
      whyItMatters: 'You almost certainly have reviews — we just can\'t pull them through the API yet. Once Google approves the call, the backlog appears here.',
      score: 60,
      weight: 2,
      easeOfFix: 4,
    }
  }

  if (total === 0) {
    return {
      id: 'reviews_waiting',
      category: 'look_engaged',
      severity: 'warning',
      headline: 'No recent reviews',
      evidence: 'No reviews captured in the last 90 days.',
      benchmark: `Active restaurants like yours get ${benchmarks.reviewsPerMonth}+ reviews/month. Connect GBP to pull them in.`,
      whyItMatters: 'Reviews are social proof. People reading reviews are 3-5x more likely to visit. Zero recent reviews signals either no traffic or no ask system — both fixable.',
      ctaPrimary: 'Check connections',
      ctaPrompt: 'I have no recent reviews coming in. Can you check my connections and help me start asking customers for reviews?',
      score: 30,
      weight: 2,
      easeOfFix: 3,
    }
  }

  if (open.length === 0) {
    return {
      id: 'reviews_waiting',
      category: 'look_engaged',
      severity: 'strength',
      headline: 'All recent reviews replied to',
      evidence: `${total} reviews in the last 90 days, all addressed.`,
      benchmark: 'Restaurants replying within 24h see 18% more repeat customers.',
      whyItMatters: 'Replying to reviews shows future customers you care. Google also rewards active engagement in local search rankings.',
      score: 100,
      weight: 2,
    }
  }

  const oldestOpen = open.reduce((oldest, r) => {
    return new Date(r.created_at_platform).getTime() < new Date(oldest.created_at_platform).getTime() ? r : oldest
  }, open[0])
  const oldestDays = Math.floor((Date.now() - new Date(oldestOpen.created_at_platform).getTime()) / 86_400_000)
  const responseRate = ((total - open.length) / total) * 100

  const bySource = open.reduce((m, r) => {
    m[r.source] = (m[r.source] ?? 0) + 1
    return m
  }, {} as Record<string, number>)
  const sourceBreakdown = Object.entries(bySource)
    .map(([s, n]) => `${s.toUpperCase()} (${n})`)
    .join(', ')

  const severity: Severity = open.length > 10 ? 'critical' : open.length > 3 ? 'warning' : 'warning'
  const score = Math.round(responseRate * 0.9)  // 0% response = 0 score, 100% = 90 score
  return {
    id: 'reviews_waiting',
    category: 'look_engaged',
    severity,
    headline: `${open.length} review${open.length === 1 ? '' : 's'} waiting for a reply`,
    evidence: `${sourceBreakdown}. Oldest unanswered is ${oldestDays} days old.`,
    benchmark: 'Restaurants replying within 24h see 18% more repeat customers.',
    whyItMatters: 'Unanswered reviews tell future customers nobody\'s listening. A response — even a generic "thanks" — flips the perception. Replies within 24h get rewarded by Google\'s ranking algorithm.',
    ctaPrimary: 'Draft replies for me',
    ctaSecondary: 'Skip',
    ctaPrompt: `I have ${open.length} reviews waiting for a reply across ${sourceBreakdown}. Can you draft replies for the most recent ones?`,
    score,
    weight: 2,
    easeOfFix: 1,
  }
}

/* LOOK ENGAGED — Review sentiment / recurring themes. */
async function checkReviewSentiment(ctx: CheckContext): Promise<Finding> {
  const { admin, clientId } = ctx
  const { data } = await admin
    .from('review_themes')
    .select('themes, review_count, window_start, window_end, generated_at')
    .eq('client_id', clientId)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle() as { data: { themes: Array<{ theme: string; mentions: number; praise?: number; critical?: number }>; review_count: number } | null }

  if (!data || !data.themes || data.themes.length === 0) {
    return {
      id: 'review_sentiment',
      category: 'look_engaged',
      severity: 'warning',
      headline: 'No sentiment analysis yet',
      evidence: 'We haven\'t analyzed your review themes yet (needs 5+ reviews).',
      benchmark: 'Theme analysis surfaces recurring praise and complaints — gold for menu + service decisions.',
      whyItMatters: 'Single reviews are anecdotes. Patterns are insight. When 5 reviews say the same thing, that\'s the truth.',
      score: 50,
      weight: 1,
      easeOfFix: 3,
    }
  }

  const negative = data.themes.filter(t => (t.critical ?? 0) > (t.praise ?? 0))
    .sort((a, b) => b.mentions - a.mentions)
  const positive = data.themes.filter(t => (t.praise ?? 0) > (t.critical ?? 0))
    .sort((a, b) => b.mentions - a.mentions)

  if (negative.length === 0) {
    const topPraise = positive.slice(0, 2).map(t => `"${t.theme}"`).join(' and ')
    return {
      id: 'review_sentiment',
      category: 'look_engaged',
      severity: 'strength',
      headline: 'Strong sentiment — no recurring complaints',
      evidence: positive.length > 0 ? `Top praise themes: ${topPraise}.` : 'Reviews are overwhelmingly positive.',
      benchmark: 'Lean into what people love. Use praise themes in your marketing copy.',
      whyItMatters: 'Praise themes are your free copywriting. The exact words customers use to describe what they love beat anything an agency would write.',
      score: 100,
      weight: 1,
    }
  }

  const topNeg = negative[0]
  const severity: Severity = topNeg.mentions >= 5 ? 'critical' : 'warning'
  return {
    id: 'review_sentiment',
    category: 'look_engaged',
    severity,
    headline: `${negative.length} recurring issue${negative.length === 1 ? '' : 's'} in recent reviews`,
    evidence: `Top complaint: "${topNeg.theme}" (${topNeg.mentions} mention${topNeg.mentions === 1 ? '' : 's'}).`,
    benchmark: 'Recurring complaints rarely fix themselves. The pattern is the signal.',
    whyItMatters: 'The same complaint from multiple reviewers in 90 days is operational signal, not noise. Most owners ignore patterns until they become 1-star tanks. Catch them early and fix the root cause.',
    ctaPrimary: 'Show me these reviews',
    ctaSecondary: 'Skip for now',
    ctaPrompt: `Show me the reviews that mention "${topNeg.theme}" — what are people specifically saying?`,
    score: Math.max(20, 100 - topNeg.mentions * 10),
    weight: 1,
    easeOfFix: 4,
  }
}

/* LOOK ENGAGED — Photo coverage on GBP. */
async function checkPhotoCoverage(ctx: CheckContext): Promise<Finding> {
  const { admin, clientId, benchmarks } = ctx
  const { data } = await admin
    .from('gbp_metrics')
    .select('photo_count, date')
    .eq('client_id', clientId)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle() as { data: { photo_count: number | null; date: string } | null }
  const count = data?.photo_count ?? 0

  if (count === 0) {
    return {
      id: 'photo_coverage',
      category: 'look_engaged',
      severity: 'warning',
      headline: 'Photo count unknown',
      evidence: 'We don\'t have GBP photo count data yet.',
      benchmark: `Top performers in your category have ${benchmarks.photoTarget}+ photos. Photos drive ~27% more profile views.`,
      whyItMatters: 'Photos are how people decide whether to visit. Without them, the algorithm shows you less and customers scroll past.',
      ctaPrimary: 'Connect Business Profile',
      ctaPrompt: 'Help me connect my Google Business Profile so we can track photos.',
      score: 40,
      weight: 1,
      easeOfFix: 2,
    }
  }

  const target = benchmarks.photoTarget
  let severity: Severity = 'critical'
  let score = 0
  if (count >= target) { severity = 'strength'; score = 100 }
  else if (count >= target * 0.5) { severity = 'warning'; score = 70 }
  else if (count >= target * 0.2) { severity = 'warning'; score = 40 }
  else { severity = 'critical'; score = 20 }

  if (severity === 'strength') {
    return {
      id: 'photo_coverage',
      category: 'look_engaged',
      severity,
      headline: `Strong: ${count} photos on Google Business Profile`,
      evidence: `Above the ${target}+ benchmark for your category. You're in the top tier.`,
      benchmark: 'Keep adding fresh photos monthly to stay top-ranked.',
      whyItMatters: 'Photos compound: each new addition signals to Google that the business is alive and active, boosting rankings.',
      score,
      weight: 1,
    }
  }
  return {
    id: 'photo_coverage',
    category: 'look_engaged',
    severity,
    headline: `${count} photo${count === 1 ? '' : 's'} on your Google Business Profile`,
    evidence: `Target for your category: ${target}+. Fresh photos correlate with 27% more profile views.`,
    benchmark: `Aim for ${target}+. Mix food (60%) + interior (20%) + exterior + team.`,
    whyItMatters: 'Restaurants with more photos rank higher in Google Maps and get more clicks. Owners who add 4+ photos/month outperform photo-stagnant peers by 35% on profile views.',
    ctaPrimary: 'Help me plan a photo refresh',
    ctaSecondary: 'Upload from your phone',
    ctaPrompt: `I only have ${count} photos on my Google profile (target: ${target}+). What dishes / shots should I prioritize for a fresh photo session?`,
    score,
    weight: 1,
    easeOfFix: 3,
  }
}

/* STAY ACTIVE — Menu freshness (internal menu_items). */
async function checkMenuFreshness(ctx: CheckContext): Promise<Finding> {
  const { admin, clientId } = ctx
  const { data } = await admin
    .from('menu_items')
    .select('updated_at')
    .eq('client_id', clientId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle() as { data: { updated_at: string } | null }

  if (!data) {
    return {
      id: 'menu_freshness',
      category: 'stay_active',
      severity: 'warning',
      headline: 'No menu items on file',
      evidence: 'We don\'t have a menu for your restaurant yet.',
      benchmark: 'A current menu lets the AI suggest features, draft posts about specific dishes, and answer customer questions.',
      whyItMatters: 'Apnosh AI can only help with menu/specials/promos if we have the menu data. Adding it unlocks half the AI\'s value.',
      ctaPrimary: 'Add your menu',
      ctaPrompt: 'I don\'t have my menu in Apnosh yet. Can you walk me through adding it?',
      score: 30,
      weight: 1,
      easeOfFix: 2,
    }
  }
  const daysSince = Math.floor((Date.now() - new Date(data.updated_at).getTime()) / 86_400_000)
  if (daysSince <= 14) {
    return {
      id: 'menu_freshness',
      category: 'stay_active',
      severity: 'strength',
      headline: 'Menu is fresh',
      evidence: `Last menu update was ${daysSince} day${daysSince === 1 ? '' : 's'} ago.`,
      benchmark: 'Restaurants updating menus monthly see more engagement from regulars.',
      whyItMatters: 'Regulars stop returning when the menu never changes. Quarterly tweaks signal you\'re evolving and give people a reason to come back.',
      score: 100,
      weight: 1,
    }
  }
  const severity: Severity = daysSince > 90 ? 'critical' : 'warning'
  return {
    id: 'menu_freshness',
    category: 'stay_active',
    severity,
    headline: `Menu hasn't changed in ${daysSince} days`,
    evidence: `Last update: ${new Date(data.updated_at).toLocaleDateString()}.`,
    benchmark: 'Stale menus lead to "they didn\'t have what was advertised" reviews. Refresh quarterly at minimum.',
    whyItMatters: 'Menus go stale operationally (prices drift, items get 86\'d) and emotionally (regulars get bored). Every menu update is also a marketing opportunity — Google posts, IG carousels, email blasts.',
    ctaPrimary: 'Walk me through my menu',
    ctaSecondary: 'Skip',
    ctaPrompt: `My menu hasn't been updated in ${daysSince} days. Can you pull it up and help me decide what to refresh — prices, descriptions, photos, or items to add/remove?`,
    score: Math.max(20, 100 - daysSince),
    weight: 1,
    easeOfFix: 2,
  }
}

/* STAY ACTIVE — Recent agent activity. Have we actually been doing things? */
async function checkRecentActivity(ctx: CheckContext): Promise<Finding> {
  const { admin, clientId } = ctx
  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const { data } = await admin
    .from('agent_tool_executions')
    .select('tool_name, executed_at, status')
    .eq('client_id', clientId)
    .eq('status', 'executed')
    .gte('executed_at', since30)
  const executions = (data ?? []) as Array<{ tool_name: string; executed_at: string; status: string }>
  const count = executions.length

  if (count === 0) {
    return {
      id: 'recent_activity',
      category: 'stay_active',
      severity: 'critical',
      headline: 'No AI activity in the last 30 days',
      evidence: 'You haven\'t used Apnosh AI to do anything yet.',
      benchmark: 'Active clients run 5-15 AI actions/month. Start small — ask the AI to draft a Google post.',
      whyItMatters: 'Apnosh AI is your unfair advantage — but only if you use it. Owners who try one action in their first week stay 3x longer than those who don\'t.',
      ctaPrimary: 'Try the AI now',
      ctaPrompt: 'What\'s one quick thing I can do today to make my marketing better? Pick something specific to my restaurant.',
      score: 10,
      weight: 1,
      easeOfFix: 1,
    }
  }
  let severity: Severity = 'critical'
  let score = 0
  if (count >= 15) { severity = 'strength'; score = 100 }
  else if (count >= 5) { severity = 'warning'; score = 65 }
  else { severity = 'warning'; score = 40 }
  return {
    id: 'recent_activity',
    category: 'stay_active',
    severity,
    headline: severity === 'strength'
      ? `Strong: ${count} AI actions in the last 30 days`
      : `${count} AI action${count === 1 ? '' : 's'} in the last 30 days`,
    evidence: `Most common: ${[...new Set(executions.map(e => e.tool_name))].slice(0, 3).join(', ')}.`,
    benchmark: severity === 'strength'
      ? 'Keep going — momentum compounds.'
      : 'Active clients run 5-15 AI actions/month. Try the chat for review replies and Google posts.',
    whyItMatters: severity === 'strength'
      ? 'High usage signals you\'re extracting value. Each tool call captures judgment, builds your context library, and improves future suggestions.'
      : 'Light usage means you\'re paying for capability you\'re not capturing. The Top 3 quick wins above each take <2 minutes via chat.',
    score,
    weight: 1,
    easeOfFix: 1,
  }
}

// ─── NEW v2 findings ───────────────────────────────────────────────────

/* GET FOUND — Channel diversity. Are we beyond just Google? */
async function checkChannelDiversity(ctx: CheckContext): Promise<Finding> {
  const { admin, clientId } = ctx
  const { data } = await admin
    .from('channel_connections')
    .select('channel, status')
    .eq('client_id', clientId)
    .eq('status', 'active')
  const channels = (data ?? []) as Array<{ channel: string }>
  const active = new Set(channels.map(c => c.channel))
  /* Count distinct "platforms" — group Google services together. */
  const hasGoogle = ['google_business_profile', 'google_search_console', 'google_analytics']
    .some(c => active.has(c))
  const hasInstagram = active.has('instagram') || active.has('instagram_direct')
  const hasFacebook = active.has('facebook')
  const hasTiktok = active.has('tiktok')
  const hasYelp = active.has('yelp')
  const platforms = [hasGoogle, hasInstagram, hasFacebook, hasTiktok, hasYelp].filter(Boolean).length
  const missing = [
    !hasGoogle && 'Google',
    !hasInstagram && 'Instagram',
    !hasFacebook && 'Facebook',
    !hasTiktok && 'TikTok',
    !hasYelp && 'Yelp',
  ].filter(Boolean) as string[]

  if (platforms >= 4) {
    return {
      id: 'channel_diversity',
      category: 'get_found',
      severity: 'strength',
      headline: `Strong: ${platforms} channels connected`,
      evidence: 'Google + social + reviews — broad coverage.',
      benchmark: 'You\'re feeding the AI from multiple angles.',
      whyItMatters: 'Multi-channel connections mean the AI sees a fuller picture and can post coordinated campaigns across platforms.',
      score: 100,
      weight: 1,
    }
  }
  const severity: Severity = platforms === 0 ? 'critical' : platforms <= 1 ? 'critical' : 'warning'
  return {
    id: 'channel_diversity',
    category: 'get_found',
    severity,
    headline: `${platforms} of 5 channels connected`,
    evidence: missing.length > 0 ? `Missing: ${missing.join(', ')}.` : '',
    benchmark: 'Most restaurants benefit from at least Google + Instagram + Yelp.',
    whyItMatters: 'Each unconnected channel is a blind spot — we can\'t draft posts for IG if we can\'t see it, and we can\'t reply to Yelp reviews if we\'re not authorized.',
    ctaPrimary: 'Connect more channels',
    ctaSecondary: 'Skip',
    ctaPrompt: `I only have ${platforms} channels connected. Walk me through connecting ${missing.slice(0, 2).join(' and ')}.`,
    score: Math.round((platforms / 5) * 100),
    weight: 1,
    easeOfFix: 2,
  }
}

/* LOOK ENGAGED — Yelp presence health. */
async function checkYelpPresence(ctx: CheckContext): Promise<Finding> {
  const { admin, clientId } = ctx
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString()
  const { data } = await admin
    .from('local_reviews')
    .select('id, rating, status, created_at_platform')
    .eq('client_id', clientId)
    .eq('source', 'yelp')
    .gte('created_at_platform', since)
  const yelpReviews = (data ?? []) as Array<{ rating: number; status: string }>
  if (yelpReviews.length === 0) {
    return {
      id: 'yelp_presence',
      category: 'look_engaged',
      severity: 'warning',
      headline: 'No recent Yelp activity',
      evidence: 'No Yelp reviews captured in the last 90 days.',
      benchmark: 'Even quiet Yelp listings deserve monitoring — silent reviews can tank your average.',
      whyItMatters: 'Yelp matters most for first-time customers researching options. A neglected Yelp listing with one bad review and zero responses is worse than no listing at all.',
      ctaPrimary: 'Check Yelp connection',
      ctaPrompt: 'I don\'t see Yelp data — can you check if it\'s connected and help me claim my listing if not?',
      score: 50,
      weight: 0.5,
      easeOfFix: 3,
    }
  }
  const avg = yelpReviews.reduce((s, r) => s + (r.rating ?? 0), 0) / yelpReviews.length
  const open = yelpReviews.filter(r => r.status === 'open').length
  const responseRate = ((yelpReviews.length - open) / yelpReviews.length) * 100
  /* Yelp score: half weight on avg rating, half on response rate. */
  const ratingScore = ((avg - 1) / 4) * 100   // 1★=0, 5★=100
  const score = Math.round(ratingScore * 0.5 + responseRate * 0.5)
  const severity: Severity = score >= 75 ? 'strength' : score >= 50 ? 'warning' : 'critical'
  return {
    id: 'yelp_presence',
    category: 'look_engaged',
    severity,
    headline: `Yelp: ${avg.toFixed(1)}★ avg · ${responseRate.toFixed(0)}% response rate`,
    evidence: `${yelpReviews.length} Yelp reviews in 90d. ${open} unanswered.`,
    benchmark: 'Aim for 4.0★+ and 80%+ response rate on Yelp.',
    whyItMatters: 'Yelp users skew "researching where to eat tonight." Good ratings + active responses convert; weak ratings drive them to a competitor.',
    ctaPrimary: 'Reply to Yelp reviews',
    ctaPrompt: `Draft replies to my unanswered Yelp reviews from the last 90 days.`,
    score,
    weight: 0.5,
    easeOfFix: 1,
  }
}

/* LOOK ENGAGED — Review rating trend (improving or declining?). */
async function checkRatingTrend(ctx: CheckContext): Promise<Finding> {
  const { admin, clientId } = ctx
  const now = Date.now()
  const last30 = new Date(now - 30 * 86_400_000).toISOString()
  const prior30 = new Date(now - 60 * 86_400_000).toISOString()
  const { data: recentR } = await admin
    .from('local_reviews')
    .select('rating, created_at_platform')
    .eq('client_id', clientId)
    .gte('created_at_platform', last30)
  const { data: priorR } = await admin
    .from('local_reviews')
    .select('rating, created_at_platform')
    .eq('client_id', clientId)
    .gte('created_at_platform', prior30)
    .lt('created_at_platform', last30)
  const recent = (recentR ?? []) as Array<{ rating: number }>
  const prior = (priorR ?? []) as Array<{ rating: number }>
  if (recent.length < 3 || prior.length < 3) {
    return {
      id: 'rating_trend',
      category: 'look_engaged',
      severity: 'warning',
      headline: 'Not enough data for trend',
      evidence: `${recent.length} reviews in last 30d · ${prior.length} in prior 30d.`,
      benchmark: 'We need 3+ reviews in each period to detect a meaningful trend.',
      whyItMatters: 'Trend matters more than average. A 4.5★ business sliding to 4.2★ is much more urgent than a stable 4.0★.',
      score: 50,
      weight: 0.5,
      easeOfFix: 4,
    }
  }
  const recentAvg = recent.reduce((s, r) => s + (r.rating ?? 0), 0) / recent.length
  const priorAvg = prior.reduce((s, r) => s + (r.rating ?? 0), 0) / prior.length
  const delta = recentAvg - priorAvg
  if (Math.abs(delta) < 0.15) {
    return {
      id: 'rating_trend',
      category: 'look_engaged',
      severity: 'strength',
      headline: `Rating stable at ${recentAvg.toFixed(1)}★`,
      evidence: `Last 30d vs prior 30d: ${priorAvg.toFixed(2)}★ → ${recentAvg.toFixed(2)}★ (Δ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}).`,
      benchmark: 'Consistency is good. Now focus on quantity.',
      whyItMatters: 'Stable ratings let you focus on growth instead of damage control.',
      score: 90,
      weight: 0.7,
    }
  }
  if (delta > 0) {
    return {
      id: 'rating_trend',
      category: 'look_engaged',
      severity: 'strength',
      headline: `Rating climbing: ${priorAvg.toFixed(1)}★ → ${recentAvg.toFixed(1)}★`,
      evidence: `Delta: +${delta.toFixed(2)} over last 30d.`,
      benchmark: 'Whatever changed, do more of it.',
      whyItMatters: 'A rising rating is a signal you\'ve found something that works. Capture it: ask the AI what changed.',
      ctaPrimary: 'What changed?',
      ctaPrompt: `My average rating went from ${priorAvg.toFixed(1)}★ to ${recentAvg.toFixed(1)}★ in the last 30 days. What's driving the improvement based on recent review content?`,
      score: 100,
      weight: 0.7,
    }
  }
  return {
    id: 'rating_trend',
    category: 'look_engaged',
    severity: Math.abs(delta) > 0.3 ? 'critical' : 'warning',
    headline: `Rating slipping: ${priorAvg.toFixed(1)}★ → ${recentAvg.toFixed(1)}★`,
    evidence: `Delta: ${delta.toFixed(2)} over last 30d.`,
    benchmark: 'Slips usually reflect operational issues. Catch the cause now.',
    whyItMatters: 'A 0.3★ drop in 30 days is a 5-alarm signal. If it continues, you\'re 60-90 days from a tanked Google ranking. Find the cause now while it\'s fixable.',
    ctaPrimary: 'Diagnose this',
    ctaPrompt: `My rating dropped ${Math.abs(delta).toFixed(2)} stars in 30 days (from ${priorAvg.toFixed(1)}★ to ${recentAvg.toFixed(1)}★). Pull the most recent negative reviews and tell me what's driving the slip.`,
    score: Math.max(20, 70 - Math.abs(delta) * 100),
    weight: 1,
    easeOfFix: 4,
  }
}

/* STAY ACTIVE — Content production in the last 30 days. */
async function checkContentProduction(ctx: CheckContext): Promise<Finding> {
  const { admin, clientId } = ctx
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const { data } = await admin
    .from('client_updates')
    .select('type, status, created_at')
    .eq('client_id', clientId)
    .eq('status', 'published')
    .gte('created_at', since)
  const published = (data ?? []) as Array<{ type: string }>
  const posts = published.filter(u => u.type === 'promotion' || u.type === 'event' || u.type === 'gbp_post').length
  if (posts === 0) {
    return {
      id: 'content_production',
      category: 'stay_active',
      severity: 'critical',
      headline: 'No content published in 30 days',
      evidence: 'No GBP posts, promotions, or events have gone out.',
      benchmark: 'Restaurants posting weekly get 30% more profile clicks.',
      whyItMatters: 'Silence reads as "closed." Even one post per week tells Google + customers that you\'re active and current.',
      ctaPrimary: 'Plan 2 weeks of content',
      ctaPrompt: 'I haven\'t published anything in 30 days. Can you plan and draft 2 weeks of Google posts for me, then queue them for my approval?',
      score: 10,
      weight: 1.5,
      easeOfFix: 1,
    }
  }
  if (posts >= 8) {
    return {
      id: 'content_production',
      category: 'stay_active',
      severity: 'strength',
      headline: `Strong: ${posts} pieces of content in 30 days`,
      evidence: 'You\'re actively engaging your audience.',
      benchmark: 'Keep the pace — momentum is your moat.',
      whyItMatters: 'Active content production signals to Google + customers that you\'re alive. It also gives you a feedback loop: which posts get clicks tells you what your audience wants.',
      score: 100,
      weight: 1.5,
    }
  }
  return {
    id: 'content_production',
    category: 'stay_active',
    severity: posts >= 4 ? 'warning' : 'critical',
    headline: `${posts} piece${posts === 1 ? '' : 's'} of content in 30 days`,
    evidence: `Target: 8+ posts/month (2x/week).`,
    benchmark: 'Restaurants posting weekly get 30% more profile clicks.',
    whyItMatters: 'Posting is the single highest-leverage habit. AI can draft 8 posts in 5 minutes — the only constraint is approving them.',
    ctaPrimary: 'Plan more content',
    ctaPrompt: `I've only posted ${posts} times in 30 days. Help me get to 8/month — draft a 2-week content calendar I can approve.`,
    score: Math.round((posts / 8) * 100),
    weight: 1.5,
    easeOfFix: 1,
  }
}

/* GET FOUND — Sentiment topic depth (food/service/atmosphere breakdown). */
async function checkSentimentTopics(ctx: CheckContext): Promise<Finding> {
  const { admin, clientId } = ctx
  const { data } = await admin
    .from('review_themes')
    .select('themes, review_count')
    .eq('client_id', clientId)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle() as { data: { themes: Array<{ theme: string; mentions: number; praise?: number; critical?: number; category?: string }> | null; review_count: number } | null }

  if (!data || !data.themes || data.themes.length === 0) {
    /* Already covered by checkReviewSentiment — skip with neutral score. */
    return {
      id: 'sentiment_topics',
      category: 'look_engaged',
      severity: 'warning',
      headline: 'Topic breakdown unavailable',
      evidence: 'Theme data not yet generated.',
      benchmark: 'Topic-level sentiment helps you target fixes precisely.',
      whyItMatters: 'Aggregate sentiment is a number. Topic-level sentiment is a roadmap — it tells you whether to fix the kitchen, the service, the ambiance, or the pricing.',
      score: 50,
      weight: 0.7,
      easeOfFix: 4,
    }
  }
  /* Look at top 5 themes, surface 1 positive + 1 negative for narrative. */
  const sorted = [...data.themes].sort((a, b) => b.mentions - a.mentions).slice(0, 5)
  const topPraise = sorted.filter(t => (t.praise ?? 0) > (t.critical ?? 0))[0]
  const topCritical = sorted.filter(t => (t.critical ?? 0) > (t.praise ?? 0))[0]
  if (!topCritical && topPraise) {
    return {
      id: 'sentiment_topics',
      category: 'look_engaged',
      severity: 'strength',
      headline: `Customers love: "${topPraise.theme}"`,
      evidence: `Mentioned in ${topPraise.mentions} reviews — almost all positive.`,
      benchmark: 'Use the exact words customers used in your marketing copy.',
      whyItMatters: 'Customer language outperforms marketing-speak every time. The phrases people use in praise reviews are your free copywriting library.',
      ctaPrimary: 'Use this in marketing',
      ctaPrompt: `My customers love "${topPraise.theme}". Help me work this language into my Google posts, Instagram captions, and website copy.`,
      score: 90,
      weight: 0.7,
      easeOfFix: 2,
    }
  }
  if (topCritical && topPraise) {
    return {
      id: 'sentiment_topics',
      category: 'look_engaged',
      severity: 'warning',
      headline: `Customers love "${topPraise.theme}", but flag "${topCritical.theme}"`,
      evidence: `Top praise: ${topPraise.mentions} mentions. Top complaint: ${topCritical.mentions} mentions.`,
      benchmark: 'Lean into the praise, address the complaint at the root.',
      whyItMatters: 'Knowing exactly what customers love + hate is more useful than any 5-star average. Marketing the love + fixing the complaint = compounding improvement.',
      ctaPrimary: 'Build a plan around these',
      ctaPrompt: `My customers love "${topPraise.theme}" but complain about "${topCritical.theme}". Help me build a marketing + operations response.`,
      score: 65,
      weight: 0.7,
      easeOfFix: 3,
    }
  }
  return {
    id: 'sentiment_topics',
    category: 'look_engaged',
    severity: 'warning',
    headline: 'Mixed signals in recent themes',
    evidence: `${sorted.length} themes tracked.`,
    benchmark: 'Look for repeating language to identify root causes.',
    whyItMatters: 'Mixed reviews are a signal that consistency is wobbly. Customers experiencing the same place but seeing different outcomes.',
    score: 55,
    weight: 0.7,
    easeOfFix: 4,
  }
}

// ─── orchestration ────────────────────────────────────────────────────

const CATEGORY_OF: Record<Category, Array<(ctx: CheckContext) => Promise<Finding>>> = {
  get_found: [checkProfileCompleteness, checkSearchDemand, checkConnectionHealth, checkChannelDiversity],
  look_engaged: [checkReviewsWaiting, checkReviewSentiment, checkSentimentTopics, checkPhotoCoverage, checkYelpPresence, checkRatingTrend],
  stay_active: [checkMenuFreshness, checkRecentActivity, checkContentProduction],
}

export async function runAudit(
  clientId: string,
  opts: {
    persist?: boolean
    /** When true, generate (or reuse cached) Claude narrative. */
    withNarrative?: boolean
    /** Restaurant context for narrative generation. */
    restaurantName?: string
    cuisine?: string | null
  } = {},
): Promise<AuditResult> {
  const admin = getAdmin()
  const benchmarks = getBenchmarks(opts.cuisine)
  const ctx: CheckContext = { admin, clientId, benchmarks }
  const allFindings: Finding[] = []

  for (const category of Object.keys(CATEGORY_OF) as Category[]) {
    const results = await Promise.all(CATEGORY_OF[category].map(fn => fn(ctx)))
    allFindings.push(...results)
  }

  const scoreCategory = (cat: Category): number => {
    const inCat = allFindings.filter(f => f.category === cat)
    if (inCat.length === 0) return 0
    const totalWeight = inCat.reduce((s, f) => s + f.weight, 0)
    const weighted = inCat.reduce((s, f) => s + f.score * f.weight, 0)
    return Math.round(weighted / totalWeight)
  }
  const scoreGetFound = scoreCategory('get_found')
  const scoreLookEngaged = scoreCategory('look_engaged')
  const scoreStayActive = scoreCategory('stay_active')

  /* Compute scoreImpact per finding: how many overall-score points
     would this finding move if fixed to 100? Formula:
       (100 - findingScore) × (findingWeight / totalCategoryWeight) × (categoryWeight / 100) */
  for (const f of allFindings) {
    const sameCat = allFindings.filter(x => x.category === f.category)
    const totalCatWeight = sameCat.reduce((s, x) => s + x.weight, 0)
    const catWeight = CATEGORY_WEIGHTS[f.category] / 100
    const upside = ((100 - f.score) * f.weight / totalCatWeight) * catWeight
    f.scoreImpact = Math.round(upside)
  }

  const scoreOverall = Math.round(
    (scoreGetFound * CATEGORY_WEIGHTS.get_found
      + scoreLookEngaged * CATEGORY_WEIGHTS.look_engaged
      + scoreStayActive * CATEGORY_WEIGHTS.stay_active) / 100,
  )

  const result: AuditResult = {
    clientId,
    ranAt: new Date().toISOString(),
    scoreOverall,
    scoreGetFound,
    scoreLookEngaged,
    scoreStayActive,
    findings: allFindings,
    narrative: null,
  }

  /* Generate narrative if requested. Try reusing a recent one (last 6 hours)
     with the same score to avoid re-billing the AI on every page visit. */
  if (opts.withNarrative && opts.restaurantName) {
    const sixHoursAgo = new Date(Date.now() - 6 * 3_600_000).toISOString()
    const { data: recent } = await admin
      .from('audit_runs')
      .select('narrative, score_overall, score_get_found, score_look_engaged, score_stay_active')
      .eq('client_id', clientId)
      .gte('ran_at', sixHoursAgo)
      .not('narrative', 'is', null)
      .order('ran_at', { ascending: false })
      .limit(1)
      .maybeSingle() as { data: { narrative: string; score_overall: number; score_get_found: number; score_look_engaged: number; score_stay_active: number } | null }

    if (recent
      && recent.score_overall === scoreOverall
      && recent.score_get_found === scoreGetFound
      && recent.score_look_engaged === scoreLookEngaged
      && recent.score_stay_active === scoreStayActive) {
      /* Same scores → narrative is still valid. Reuse. */
      result.narrative = recent.narrative
    } else {
      try {
        const { generateNarrative } = await import('./narrative')
        const gen = await generateNarrative({
          audit: result,
          restaurantName: opts.restaurantName,
          cuisine: opts.cuisine,
        })
        result.narrative = gen.narrative
      } catch (err) {
        /* Don't fail the audit if narrative generation breaks — log + continue. */
        console.error('[audit] narrative generation failed:', (err as Error).message)
      }
    }
  }

  if (opts.persist) {
    await admin.from('audit_runs').insert({
      client_id: clientId,
      ran_at: result.ranAt,
      score_overall: scoreOverall,
      score_get_found: scoreGetFound,
      score_look_engaged: scoreLookEngaged,
      score_stay_active: scoreStayActive,
      findings: allFindings,
      narrative: result.narrative,
    })
  }

  return result
}

/* Pull the most recent prior audit and a short history for trend display. */
export async function getAuditTrend(clientId: string): Promise<AuditTrend> {
  const admin = getAdmin()
  /* Look for runs from at least 1 day ago — same-day re-runs aren't "previous." */
  const yesterday = new Date(Date.now() - 86_400_000).toISOString()
  const { data: prev } = await admin
    .from('audit_runs')
    .select('ran_at, score_overall, score_get_found, score_look_engaged, score_stay_active')
    .eq('client_id', clientId)
    .lt('ran_at', yesterday)
    .order('ran_at', { ascending: false })
    .limit(1)
    .maybeSingle() as { data: { ran_at: string; score_overall: number; score_get_found: number; score_look_engaged: number; score_stay_active: number } | null }

  const { data: hist } = await admin
    .from('audit_runs')
    .select('ran_at, score_overall')
    .eq('client_id', clientId)
    .order('ran_at', { ascending: false })
    .limit(8) as { data: Array<{ ran_at: string; score_overall: number }> | null }

  return {
    previous: prev ? {
      ranAt: prev.ran_at,
      scoreOverall: prev.score_overall,
      scoreGetFound: prev.score_get_found,
      scoreLookEngaged: prev.score_look_engaged,
      scoreStayActive: prev.score_stay_active,
    } : null,
    history: ((hist ?? []) as Array<{ ran_at: string; score_overall: number }>)
      .reverse()
      .map(h => ({ ranAt: h.ran_at, scoreOverall: h.score_overall })),
  }
}

/* Order findings by severity (critical first), then by score (worst first within severity). */
export function sortFindings(findings: Finding[]): Finding[] {
  const sevOrder: Record<Severity, number> = { critical: 0, warning: 1, strength: 2 }
  return [...findings].sort((a, b) => {
    const sevDiff = sevOrder[a.severity] - sevOrder[b.severity]
    if (sevDiff !== 0) return sevDiff
    return a.score - b.score
  })
}

/* Pick the top N findings as "quick wins". Ranks by:
   1. Highest scoreImpact (biggest point gain)
   2. Lowest easeOfFix (one-click first)
   3. Severity (critical first as tie-breaker)
   Excludes strengths. */
export function quickWins(findings: Finding[], n = 3): Finding[] {
  const candidates = findings.filter(f => f.severity !== 'strength')
  return [...candidates].sort((a, b) => {
    const impactDiff = (b.scoreImpact ?? 0) - (a.scoreImpact ?? 0)
    if (Math.abs(impactDiff) >= 1) return impactDiff
    const easeDiff = (a.easeOfFix ?? 3) - (b.easeOfFix ?? 3)
    if (easeDiff !== 0) return easeDiff
    const sevOrder: Record<Severity, number> = { critical: 0, warning: 1, strength: 2 }
    return sevOrder[a.severity] - sevOrder[b.severity]
  }).slice(0, n)
}
