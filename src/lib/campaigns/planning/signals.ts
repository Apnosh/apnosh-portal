import 'server-only'
/**
 * Assemble the live business SIGNALS the strategist reads (spec §2.3 / §2.6).
 * Code computes the numbers; the model only interprets them. Every source is
 * best-effort: a failed lookup degrades to an empty/neutral signal so a
 * diagnosis can always run, and we never assert data we don't have.
 *
 * Reputation is fully real. Presence is Google (real %) + Yelp/Apple (coarse,
 * from the citation audit). Segments come only from email_list_snapshot.segments
 * and are empty for most clients until a list sync feeds that table.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { getRecentReviews } from '@/lib/dashboard/get-recent-reviews'
import { getImpactSummary } from '@/lib/dashboard/get-impact-summary'
import { getCachedThemes } from '@/lib/review-themes'
import { getListingHealth } from '@/lib/listing-health'
import { getCitationAudits } from '@/lib/citation-audit'
import type { PlanningSignals, ReputationSignal, SegmentSignal, PresenceSignal } from './types'

async function reputation(clientId: string): Promise<ReputationSignal> {
  const [reviews, impact, themesRes] = await Promise.all([
    getRecentReviews(clientId, 1).catch(() => null),
    getImpactSummary(clientId).catch(() => null),
    getCachedThemes(clientId).catch(() => null),
  ])
  const rating = impact?.rating ?? reviews?.avgRating ?? null
  const ratingCount = impact?.ratingCount ?? reviews?.total ?? null
  // Only assert a trend when GBP metrics are actually ingested — otherwise
  // getImpactSummary returns 0/0 (hasData:false) and we'd feed the strategist a
  // fabricated "+0 flat" that the prompt is told to treat as real.
  const trend = impact && impact.hasData ? impact.reviewsThisMonth - impact.reviewsPrevMonth : undefined
  const themes = (themesRes?.themes ?? [])
    .slice(0, 6)
    .map((t) => ({ label: t.theme, good: t.praise >= t.critical, mentions: t.mentions }))
  return { rating, ratingCount, trend, themes }
}

async function presence(clientId: string): Promise<PresenceSignal[]> {
  const out: PresenceSignal[] = []
  // Google — real 0-100 completeness + the top fixes as gaps.
  try {
    // getListingHealth hits Google with no timeout; cap it so a hung GBP call
    // degrades to "no presence data" instead of blowing the route's budget and
    // returning a 504 (a diagnosis must always render).
    const lh = await Promise.race([
      getListingHealth(clientId),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000)),
    ])
    if (lh) out.push({ name: 'Google Business Profile', completeness: lh.score, gaps: lh.topFixes.map((f) => f.label) })
  } catch { /* skip channel */ }
  // Yelp / Apple Maps — the citation audit only gives found + consistent booleans,
  // so map to a coarse completeness rather than claim a precise %.
  try {
    const audit = await getCitationAudits(clientId)
    for (const a of audit?.audits ?? []) {
      if (a.platform !== 'yelp' && a.platform !== 'apple_maps') continue
      const found = !!a.listingUrl
      // Tri-state: verified-consistent 90, known-inconsistent 50, found-but-
      // unverified (consistent null) a middling 70 so it can't read as clean.
      const completeness = !found ? 0 : a.consistent === true ? 90 : a.consistent === false ? 50 : 70
      const gaps = !found ? ['Not listed yet'] : a.inconsistencies.slice(0, 3)
      out.push({ name: a.platform === 'yelp' ? 'Yelp' : 'Apple Maps', completeness, gaps })
    }
  } catch { /* skip channel */ }
  return out
}

/** Infer tone from the segment NAME only (not invented) — keyword heuristic. */
function toneFor(name: string): SegmentSignal['tone'] {
  const n = name.toLowerCase()
  if (/lapsed|inactive|churn|slipping|dormant|cold|unsub|win.?back/.test(n)) return 'risk'
  if (/vip|regular|loyal|frequent|active|repeat/.test(n)) return 'good'
  return 'opportunity'
}

async function segments(clientId: string): Promise<SegmentSignal[]> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('email_list_snapshot')
      .select('segments, year, month')
      .eq('client_id', clientId)
      .order('year', { ascending: false })
      .order('month', { ascending: false })
      .limit(1)
      .maybeSingle()
    const raw = (data as { segments?: { name?: string; count?: number }[] } | null)?.segments ?? []
    return raw
      .filter((s): s is { name: string; count: number } => !!s && typeof s.name === 'string' && typeof s.count === 'number')
      .map((s, i) => ({ id: `seg-${i}`, name: s.name, count: s.count, tone: toneFor(s.name) }))
  } catch {
    return []
  }
}

export async function assembleSignals(clientId: string): Promise<PlanningSignals> {
  const [rep, pres, segs] = await Promise.all([
    reputation(clientId),
    presence(clientId),
    segments(clientId),
  ])
  return { reputation: rep, presence: pres, segments: segs }
}
