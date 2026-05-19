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

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ─── individual checks ────────────────────────────────────────────────

/* GET FOUND — Profile completeness on GBP + client_profiles. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkProfileCompleteness(admin: any, clientId: string): Promise<Finding> {
  const { data: gbp } = await admin
    .from('gbp_locations')
    .select('location_name, address, store_code, hours, phone, website')
    .eq('client_id', clientId)
    .limit(1)
    .maybeSingle() as { data: Record<string, unknown> | null }

  const { data: profile } = await admin
    .from('client_profiles')
    .select('business_description, service_styles, cuisine, price_range')
    .eq('client_id', clientId)
    .maybeSingle() as { data: Record<string, unknown> | null }

  /* Score based on how many of the key fields are populated. */
  const FIELDS = [
    { key: 'location_name', from: gbp, label: 'Business name' },
    { key: 'address', from: gbp, label: 'Address' },
    { key: 'phone', from: gbp, label: 'Phone' },
    { key: 'website', from: gbp, label: 'Website URL' },
    { key: 'hours', from: gbp, label: 'Hours' },
    { key: 'business_description', from: profile, label: 'Description' },
    { key: 'cuisine', from: profile, label: 'Cuisine type' },
    { key: 'price_range', from: profile, label: 'Price range' },
  ]
  const filled = FIELDS.filter(f => {
    const v = f.from?.[f.key]
    return v !== null && v !== undefined && v !== ''
  }).length
  const pctFilled = (filled / FIELDS.length) * 100
  const missing = FIELDS.filter(f => {
    const v = f.from?.[f.key]
    return v === null || v === undefined || v === ''
  }).map(f => f.label)

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
      score,
      weight: 1,
    }
  }
  return {
    id: 'profile_completeness',
    category: 'get_found',
    severity,
    headline: `Your profile is missing ${missing.length} key field${missing.length === 1 ? '' : 's'}`,
    evidence: `Missing: ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? `, and ${missing.length - 4} more` : ''}.`,
    benchmark: `Top performers fill 95%+ of available fields. You're at ${Math.round(pctFilled)}%.`,
    ctaPrimary: 'Help me fill these in',
    ctaSecondary: 'Skip',
    ctaPrompt: `My Google profile is missing ${missing.length} fields: ${missing.join(', ')}. Can you walk me through filling each one in?`,
    score,
    weight: 1,
  }
}

/* GET FOUND — Local search demand from GSC. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkSearchDemand(admin: any, clientId: string): Promise<Finding> {
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
      ctaPrimary: 'Connect Search Console',
      score: 30,
      weight: 1,
    }
  }
  /* Score based on absolute impressions — anything above 1000/mo is healthy. */
  const score = Math.min(100, Math.round((impressions / 1000) * 50 + (clicks / impressions) * 5000))
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
      : 'A healthy single-location restaurant typically sees 2,000+ impressions/mo. Posting, photos, and reviews are the biggest levers.',
    score,
    weight: 1,
  }
}

/* GET FOUND — Connection health. Broken connections = invisible data = poor SEO signals. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkConnectionHealth(admin: any, clientId: string): Promise<Finding> {
  const { data } = await admin
    .from('channel_connections')
    .select('channel, status, sync_error')
    .eq('client_id', clientId)
    .in('channel', ['google_business_profile', 'google_search_console', 'google_analytics'])
  const conns = (data ?? []) as Array<{ channel: string; status: string; sync_error: string | null }>
  const errored = conns.filter(c => c.status === 'error')
  const total = conns.length
  if (total === 0) {
    return {
      id: 'connection_health',
      category: 'get_found',
      severity: 'critical',
      headline: 'No accounts connected yet',
      evidence: 'Connect your Google Business Profile and Search Console so we can start working.',
      benchmark: 'Connected accounts unlock posts, review responses, hours updates, and analytics.',
      ctaPrimary: 'Connect accounts',
      ctaPrompt: 'I haven\'t connected my Google accounts yet. Can you walk me through it?',
      score: 0,
      weight: 1,
    }
  }
  if (errored.length === 0) {
    return {
      id: 'connection_health',
      category: 'get_found',
      severity: 'strength',
      headline: `All ${total} Google connections healthy`,
      evidence: 'Data flowing for Business Profile, Search Console, Analytics.',
      benchmark: 'Keep them connected to maintain visibility and feed the AI fresh data.',
      score: 100,
      weight: 1,
    }
  }
  const channelNames: Record<string, string> = {
    google_business_profile: 'Business Profile',
    google_search_console: 'Search Console',
    google_analytics: 'Analytics',
  }
  return {
    id: 'connection_health',
    category: 'get_found',
    severity: 'critical',
    headline: `${errored.length} of ${total} Google connections need attention`,
    evidence: errored.map(e => channelNames[e.channel] ?? e.channel).join(', ') + ' — sync failing.',
    benchmark: 'Broken connections mean missed analytics, lost review notifications, and stale Google data.',
    ctaPrimary: 'Help me fix these',
    ctaSecondary: 'Skip',
    ctaPrompt: `Some of my Google connections are failing: ${errored.map(e => channelNames[e.channel] ?? e.channel).join(', ')}. Can you walk me through reconnecting them?`,
    score: Math.round(((total - errored.length) / total) * 60),  // capped at 60 if anything's broken
    weight: 1,
  }
}

/* LOOK ENGAGED — Reviews waiting for reply. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkReviewsWaiting(admin: any, clientId: string): Promise<Finding> {
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString()
  const { data } = await admin
    .from('local_reviews')
    .select('id, status, created_at_platform, source')
    .eq('client_id', clientId)
    .gte('created_at_platform', since)
  const reviews = (data ?? []) as Array<{ status: string; created_at_platform: string; source: string }>
  const open = reviews.filter(r => r.status === 'open')
  const total = reviews.length

  if (total === 0) {
    return {
      id: 'reviews_waiting',
      category: 'look_engaged',
      severity: 'warning',
      headline: 'No recent reviews',
      evidence: 'No reviews captured in the last 90 days.',
      benchmark: 'Active restaurants get 5-20 reviews/month. Connect Google Business Profile to pull them in.',
      ctaPrimary: 'Check connections',
      score: 50,
      weight: 2,
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
    ctaPrimary: 'Draft replies for me',
    ctaSecondary: 'Skip',
    ctaPrompt: `I have ${open.length} reviews waiting for a reply across ${sourceBreakdown}. Can you draft replies for the most recent ones?`,
    score,
    weight: 2,
  }
}

/* LOOK ENGAGED — Review sentiment / recurring themes. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkReviewSentiment(admin: any, clientId: string): Promise<Finding> {
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
      score: 50,
      weight: 1,
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
    ctaPrimary: 'Show me these reviews',
    ctaSecondary: 'Skip for now',
    ctaPrompt: `Show me the reviews that mention "${topNeg.theme}" — what are people specifically saying?`,
    score: Math.max(20, 100 - topNeg.mentions * 10),
    weight: 1,
  }
}

/* LOOK ENGAGED — Photo coverage on GBP. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkPhotoCoverage(admin: any, clientId: string): Promise<Finding> {
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
      benchmark: 'Top performers have 30+ photos. Photos drive ~27% more profile views.',
      ctaPrimary: 'Connect Business Profile',
      score: 40,
      weight: 1,
    }
  }

  let severity: Severity = 'critical'
  let score = 0
  if (count >= 30) { severity = 'strength'; score = 100 }
  else if (count >= 15) { severity = 'warning'; score = 70 }
  else if (count >= 5) { severity = 'warning'; score = 40 }
  else { severity = 'critical'; score = 20 }

  if (severity === 'strength') {
    return {
      id: 'photo_coverage',
      category: 'look_engaged',
      severity,
      headline: `Strong: ${count} photos on Google Business Profile`,
      evidence: 'You\'re in the top tier for photo coverage.',
      benchmark: 'Keep adding fresh photos monthly to stay top-ranked.',
      score,
      weight: 1,
    }
  }
  return {
    id: 'photo_coverage',
    category: 'look_engaged',
    severity,
    headline: `${count} photo${count === 1 ? '' : 's'} on your Google Business Profile`,
    evidence: `Top performers have 30+. Fresh photos correlate with 27% more profile views.`,
    benchmark: 'Aim for 30+. Add fresh photos monthly.',
    ctaPrimary: 'Help me plan a photo refresh',
    ctaSecondary: 'Upload from your phone',
    ctaPrompt: `I only have ${count} photos on my Google profile. What dishes / shots should I prioritize for a fresh photo session, and how do I get them up to 30+?`,
    score,
    weight: 1,
  }
}

/* STAY ACTIVE — Menu freshness (internal menu_items). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkMenuFreshness(admin: any, clientId: string): Promise<Finding> {
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
      ctaPrimary: 'Add your menu',
      score: 30,
      weight: 1,
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
    ctaPrimary: 'Walk me through my menu',
    ctaSecondary: 'Skip',
    ctaPrompt: `My menu hasn't been updated in ${daysSince} days. Can you pull it up and help me decide what to refresh — prices, descriptions, photos, or items to add/remove?`,
    score: Math.max(20, 100 - daysSince),
    weight: 1,
  }
}

/* STAY ACTIVE — Recent agent activity. Have we actually been doing things? */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkRecentActivity(admin: any, clientId: string): Promise<Finding> {
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
      ctaPrimary: 'Try the AI now',
      ctaPrompt: 'What\'s one quick thing I can do today to make my marketing better? Pick something specific to my restaurant.',
      score: 10,
      weight: 1,
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
    score,
    weight: 1,
  }
}

// ─── orchestration ────────────────────────────────────────────────────

const CATEGORY_OF: Record<Category, Array<(admin: ReturnType<typeof getAdmin>, clientId: string) => Promise<Finding>>> = {
  get_found: [checkProfileCompleteness, checkSearchDemand, checkConnectionHealth],
  look_engaged: [checkReviewsWaiting, checkReviewSentiment, checkPhotoCoverage],
  stay_active: [checkMenuFreshness, checkRecentActivity],
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
  const allFindings: Finding[] = []

  for (const category of Object.keys(CATEGORY_OF) as Category[]) {
    const results = await Promise.all(CATEGORY_OF[category].map(fn => fn(admin, clientId)))
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

/* Pick the top N findings sorted by severity, exclude strengths for "quick wins". */
export function quickWins(findings: Finding[], n = 3): Finding[] {
  return sortFindings(findings).filter(f => f.severity !== 'strength').slice(0, n)
}
