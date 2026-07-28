import 'server-only'
/**
 * assembleBrainSignals — the single front door that gathers the full business signal set from the
 * existing readers and wraps each value in a Reading (usable + measured, or honestly missing).
 *
 * The audit's rule: assembleBrainSignals must be the ONE place signals are gathered, so the phases
 * do not collide widening MixSignals in five files. Every reader is called independently and
 * defensively: if one fails or is not connected, that signal stays missing and the plan degrades
 * gracefully (down to today's catalog plan when nothing is known) rather than reading a null as a
 * real value.
 *
 * Server-only (touches Supabase via the readers). Verified by typecheck against the real reader
 * return types; runtime needs the live DB.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { getCampaignProfile } from '@/lib/campaigns/builder/campaign-profile'
import { assembleSignals } from '@/lib/campaigns/planning/signals'
import { getPlanningHistory } from '@/lib/campaigns/planning/history'
import { getConnectedTargets } from '@/lib/updates/policy'
import { type BrainSignals, emptySignals } from './signals'
import { reading } from './readiness'
import { measuredLiftFrom, type MeasuredLift } from './learning'

/** Run a reader, returning null on any failure so one dead integration cannot break the plan. */
async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn()
  } catch {
    return null
  }
}

/** price_range is not on CampaignProfile; read it directly from client_profiles. */
async function readPriceRange(clientId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('client_profiles')
    .select('price_range')
    .eq('client_id', clientId)
    .maybeSingle()
  return (data as { price_range?: string | null } | null)?.price_range ?? null
}

/* ── the widened pipe (Phase 1a S4) ─────────────────────────────────────────────────────────────
 * Every reader below is a cheap read of a cron-fed table or an onboarding fact — nothing here
 * calls Google live, because this runs on the plan-mix hot path. That is also why gbpScore from
 * the live listing-health read did NOT make this list: it costs seconds of Google round-trips and
 * duplicates listingCompleteness, which the profile already carries and signal-fit already uses. */

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

/** What people actually type into Google to find this place, from the synced gbp_metrics rollup.
 *  Fills the searchTerms core key that had no reader since the day it was typed. */
async function readSearchTerms(clientId: string): Promise<string[] | null> {
  const { getGbpAnalytics } = await import('@/lib/dashboard/get-gbp-analytics')
  const summary = await getGbpAnalytics(clientId, '30d')
  const terms = (summary.topQueries ?? []).slice(0, 10).map((q) => q.query).filter(Boolean)
  return terms.length ? terms : null
}

/** Website visitors over the last 30 days, from the GA4-synced daily table. The other core key
 *  that was typed and never fed. */
async function readMonthlyVisitors(clientId: string): Promise<number | null> {
  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - THIRTY_DAYS_MS).toISOString().slice(0, 10)
  const { data } = await admin
    .from('website_metrics')
    .select('visitors')
    .eq('client_id', clientId)
    .gte('date', cutoff)
  const total = (data ?? []).reduce((n, r) => n + (Number((r as { visitors?: number }).visitors) || 0), 0)
  return total > 0 ? total : null
}

/** The owner's brand words + tone from onboarding. Absent for most; honest when it is. */
async function readBrandVoice(clientId: string): Promise<string[] | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('businesses')
    .select('brand_voice_words, brand_tone')
    .eq('client_id', clientId)
    .maybeSingle()
  if (!data) return null
  const words = Array.isArray(data.brand_voice_words) ? (data.brand_voice_words as unknown[]).map(String).filter(Boolean) : []
  if (data.brand_tone) words.push(String(data.brand_tone))
  return words.length ? words : null
}

/** Average priced item in dollars. menu_items stores price_cents, NULLABLE (a plain bagel has no
 *  price), and there is no food-cost column anywhere — which is why no reading claims one. */
async function readAvgItemPrice(clientId: string): Promise<number | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('menu_items')
    .select('price_cents')
    .eq('client_id', clientId)
    .eq('kind', 'item')
    .not('price_cents', 'is', null)
    .limit(200)
  const cents = (data ?? []).map((r) => Number((r as { price_cents?: number }).price_cents)).filter((n) => n > 0)
  if (!cents.length) return null
  return Math.round((cents.reduce((a, b) => a + b, 0) / cents.length)) / 100
}

/** Total social reach across platforms over the last 30 days, from the sync-fed daily rows. */
async function readSocialReach(clientId: string): Promise<number | null> {
  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - THIRTY_DAYS_MS).toISOString().slice(0, 10)
  const { data } = await admin
    .from('social_metrics')
    .select('reach')
    .eq('client_id', clientId)
    .gte('date', cutoff)
  const total = (data ?? []).reduce((n, r) => n + (Number((r as { reach?: number }).reach) || 0), 0)
  return total > 0 ? total : null
}

export interface AssembledBrain {
  signals: BrainSignals
  /** Per-serviceId measured lift from THIS business's own outcome history, so the live plan can
   *  rank by what actually worked here, not just the prior. Own-history first; the cuisine/price
   *  cohort prior is a later enrichment. Empty for a fresh business (cold start = the prior). */
  measured: Record<string, MeasuredLift>
}

/**
 * Gather everything we know about a business: the honestly-wrapped signal set plus the measured
 * lift from its own outcome history. Readers run in parallel; missing is explicit. The pure helpers
 * (richness, planRoute, suggestTier) and the lift ranker consume this.
 */
export async function assembleBrain(clientId: string): Promise<AssembledBrain> {
  const s = emptySignals()

  const [profile, planning, history, channels, priceRange, searchTerms, monthlyVisitors, brandVoice, avgItemPrice, socialReach] = await Promise.all([
    safe(() => getCampaignProfile(clientId)),
    safe(() => assembleSignals(clientId)),
    safe(() => getPlanningHistory(clientId)),
    safe(() => getConnectedTargets(clientId)),
    safe(() => readPriceRange(clientId)),
    safe(() => readSearchTerms(clientId)),
    safe(() => readMonthlyVisitors(clientId)),
    safe(() => readBrandVoice(clientId)),
    safe(() => readAvgItemPrice(clientId)),
    safe(() => readSocialReach(clientId)),
  ])

  if (profile) {
    s.primaryGoal = reading(profile.primaryGoal)
    s.cuisine = reading(profile.cuisine)
    s.neighborhood = reading(profile.neighborhood)
    s.listingCompleteness = reading(profile.presence)
    s.monthlyBudget = reading(profile.monthlyBudget)
    s.rating = reading(profile.rating)
    s.ratingCount = reading(profile.ratingCount)
    // A named top segment implies a real list.
    s.hasList = reading(profile.topSegment != null ? true : null)
    // The onboarding rhythm: days the owner marked slow (a real answer, never a default).
    s.slowNights = reading(profile.slowDays.length ? profile.slowDays : null)
  }

  if (planning) {
    // The planning reputation carries the same rating plus the themes/trend, so prefer it when present.
    if (planning.reputation.rating != null) s.rating = reading(planning.reputation.rating)
    if (planning.reputation.ratingCount != null) s.ratingCount = reading(planning.reputation.ratingCount)
    const complaints = planning.reputation.themes.filter((t) => !t.good).map((t) => t.label)
    s.complaintThemes = reading(complaints.length ? complaints : null)
    const listSize = planning.segments.reduce((n, seg) => n + (seg.count || 0), 0)
    s.listSize = reading(listSize > 0 ? listSize : null)
    const lapsed = planning.segments.filter((seg) => seg.tone === 'risk').reduce((n, seg) => n + (seg.count || 0), 0)
    s.lapsedCount = reading(lapsed > 0 ? lapsed : null)
    // Real segments with people in them confirm a list even if the profile top-segment was empty.
    if (listSize > 0) s.hasList = reading(true)
  }

  if (history) {
    s.droppedServiceIds = reading(history.droppedServiceIds.length ? history.droppedServiceIds : null)
    const working = history.pastLines.filter((l) => l.verdict === 'working').map((l) => l.serviceId)
    s.workingServiceIds = reading(working.length ? working : null)
  }

  if (channels) {
    const arr = Array.from(channels) as string[]
    s.connectedChannels = reading(arr.length ? arr : null)
  }

  if (priceRange) s.priceRange = reading(priceRange)

  // The two core keys that sat unpopulated since the type was written, now fed from cron tables,
  // and the three S4 enrichment readings. reading(null) stays honestly missing.
  s.searchTerms = reading(searchTerms)
  s.monthlyVisitors = reading(monthlyVisitors)
  s.brandVoice = reading(brandVoice)
  s.avgItemPrice = reading(avgItemPrice)
  s.socialReach30d = reading(socialReach)

  // Measured lift from this business's own outcomes (win-rate per service). Partial by nature
  // (only services with outcome rows), and blendLift falls back to the prior for the rest.
  const measured = history ? measuredLiftFrom(history.pastLines) : {}
  return { signals: s, measured }
}

/** Back-compat: just the signal set (callers that do not need measured lift). */
export async function assembleBrainSignals(clientId: string): Promise<BrainSignals> {
  return (await assembleBrain(clientId)).signals
}
